import { abrirBanco, limparPartida, obterAparelho } from '@/sync/db';
import { MonitorDeConexao } from '@/sync/conexao';
import { RelogioAncorado } from '@/sync/relogio';
import { escutarServidor, guardarInstantaneo } from '@/sync/pull';
import { Sincronizador } from '@/sync/saida';
import type { Cancelar } from '@/sync/remoto';
import { RemotoFirebase } from '@/firebase/remoto';
import { sair } from '@/firebase/conta';
import { destravarNoPrimeiroToque } from './feedback';
import { pedirMovimentoNoPrimeiroToque } from './sensores';

/**
 * Seção 5: a UI lê e escreve só no store local; o módulo de sync é a única ponte.
 * Uma instância de cada serviço por aba.
 */
export const db = abrirBanco();
export const remoto = new RemotoFirebase();
export const monitor = new MonitorDeConexao(() => remoto.heartbeat());
export const relogio = new RelogioAncorado(db);
export const sync = new Sincronizador(db, remoto, monitor);

let iniciado = false;
let uidAtual: string | null = null;
let escuta: Cancelar | null = null;

/** Liga monitor, sync e gatilhos (RF-34). Idempotente. */
export async function iniciarServicos(): Promise<void> {
  if (iniciado) return;
  iniciado = true;
  destravarNoPrimeiroToque();
  pedirMovimentoNoPrimeiroToque();
  await obterAparelho(db);
  await relogio.carregar();
  await sync.recuperarAoAbrir();
  monitor.aoReconectar(() => {
    void sync.aoReconectar();
    // Seção 7.2: reancora a cada reconexão (não a cada heartbeat).
    if (uidAtual) void relogio.ancorar(remoto, uidAtual).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    relogio.conferir();
    void sync.sincronizar();
  });
  monitor.iniciar();
  void sync.sincronizar();
}

/** Seção 6.3: listeners → store local, enquanto o jogador estiver na partida. */
export function ligarEscuta(uid: string): void {
  if (escuta && uidAtual === uid) return;
  desligarEscuta();
  uidAtual = uid;
  escuta = escutarServidor(
    db,
    remoto,
    () => monitor.marcarServidorIndisponivel(),
    (partidaId) => void trocarDePartida(uid, partidaId),
  );
}

export function desligarEscuta(): void {
  escuta?.();
  escuta = null;
}

/** O admin abriu uma partida nova: as filas antigas saem do store e o jogador entra na nova. */
async function trocarDePartida(uid: string, partidaId: string | null): Promise<void> {
  const jogador = await db.sessao.get('jogador');
  if (!jogador || jogador.uid !== uid || jogador.partidaId === partidaId) return;
  await limparPartida(db);
  await db.sessao.put({ ...jogador, partidaId });
  if (partidaId) await remoto.registrarParticipacao(uid, partidaId).catch(() => {});
}

/**
 * Sair da conta neste aparelho. Recusa com balançadas pendentes: elas só sobem com esta conta
 * logada e seriam perdidas. Mantém o que é do aparelho (id, preferências, dicas vistas).
 */
export async function sairDaConta(): Promise<void> {
  const pendentes = await db.saida.where('status').anyOf('pendente', 'enviando').count();
  if (pendentes > 0) throw new Error(`${pendentes} ${pendentes === 1 ? 'balançada não enviada' : 'balançadas não enviadas'}`);
  desligarEscuta();
  uidAtual = null;
  await db.transaction('rw', db.sessao, db.historico, db.saida, async () => {
    await db.sessao.delete('jogador');
    await db.historico.clear();
    await db.saida.where('status').equals('rejeitada').delete();
  });
  await sair();
}

export type EtapaEntrada = 'conta' | 'relogio' | 'pontos' | 'guardando' | 'pronto';

/** RF-04: a entrada na partida exige rede. Tudo vai para o armazenamento local. */
export async function entrarNaPartida(uid: string, aoAvancar: (e: EtapaEntrada, info?: string) => void): Promise<'ok' | 'sem-partida'> {
  aoAvancar('relogio');
  await relogio.ancorar(remoto, uid);
  aoAvancar('pontos');
  const inst = await remoto.baixarPartidaAtual();
  if (!inst) return 'sem-partida';
  aoAvancar('guardando', `${inst.pontos.filter((p) => p.ativo).length} pontos`);
  await guardarInstantaneo(db, inst);
  await remoto.registrarParticipacao(uid, inst.partida.id);
  const jogador = await db.sessao.get('jogador');
  if (jogador) await db.sessao.put({ ...jogador, partidaId: inst.partida.id });
  void atualizarHistorico(uid);
  aoAvancar('pronto');
  return 'ok';
}

/**
 * Puxar para atualizar: sincroniza tudo sem recarregar a página (recarregar faria o iPhone
 * esquecer a liberação de som e sensores). Também procura uma versão nova do app.
 */
export async function atualizarAgora(uid: string): Promise<void> {
  const tarefas: Promise<unknown>[] = [];
  if ((await monitor.heartbeat()) === 'online') {
    tarefas.push(
      sync.aoReconectar(),
      relogio.ancorar(remoto, uid).catch(() => {}),
      remoto
        .baixarPartidaAtual()
        .then((inst) => inst && guardarInstantaneo(db, inst))
        .catch(() => {}),
      atualizarHistorico(uid),
    );
  }
  tarefas.push(
    navigator.serviceWorker
      ?.getRegistration()
      .then((r) => r?.update())
      .catch(() => {}) ?? Promise.resolve(),
  );
  await Promise.all(tarefas);
}

/** RF-45: guarda o histórico localmente para ver offline. */
export async function atualizarHistorico(uid: string): Promise<void> {
  const partidas = await remoto.baixarHistorico(uid).catch(() => null);
  if (!partidas) return;
  await db.historico.bulkPut(
    partidas.map((p) => {
      const minha = p.rankingFinal?.find((l) => l.uid === uid);
      return {
        partidaId: p.id,
        numero: p.numero,
        finalizadaEm: p.finalizadaEm,
        pos: minha?.pos ?? null,
        pontos: minha?.pontos ?? 0,
        balancadas: minha?.balancadas ?? 0,
        jogadores: p.rankingFinal?.length ?? 0,
      };
    }),
  );
}
