import {
  collection,
  doc,
  FieldPath,
  getDocFromServer,
  getDocsFromServer,
  runTransaction,
  updateDoc,
  writeBatch,
  type UpdateData,
  type DocumentData,
} from 'firebase/firestore';
import { RAIO_PADRAO_M, RETENCAO_LOCALIZACAO_MS } from '@/dominio/constantes';
import { calcularRanking } from '@/dominio/ranking';
import { limparApelido, normalizarApelido, validarApelido } from '@/dominio/apelido';
import type { LinhaRanking, Partida, Ponto } from '@/dominio/tipos';
import { firestore as fs } from '@/firebase/app';
import { paraFila, paraPartida, paraPonto } from '@/firebase/conversores';
import { ref, RemotoFirebase } from '@/firebase/remoto';

/** O painel do admin é um cliente com mais permissão (seção 5); fala direto com o Firestore. */

let desvio = 0;
/** Hora do servidor para pausas e desativações, medida como na seção 7.2. */
export async function ancorarAdmin(uid: string): Promise<void> {
  const t0 = performance.now();
  const servidor = await new RemotoFirebase().horaDoServidor(uid);
  const t1 = performance.now();
  desvio = servidor + (t1 - t0) / 2 - Date.now();
}
export const agoraNoServidor = () => Math.round(Date.now() + desvio);

/** Primeiro uso: cria a partida #1 em rascunho. */
export async function garantirJogo(): Promise<void> {
  const jogo = await getDocFromServer(ref.jogo());
  if (jogo.exists() && jogo.get('partidaAtual')) return;
  const nova = doc(ref.partidas());
  const b = writeBatch(fs);
  b.set(nova, { numero: 1, estado: 'rascunho', criadaEm: agoraNoServidor(), finalizadaEm: null, pausas: [], rankingFinal: null });
  b.set(ref.jogo(), { partidaAtual: nova.id });
  await b.commit();
}

export type DadosPonto = Pick<Ponto, 'nome' | 'raioM' | 'valorBase' | 'passoPct' | 'pisoPct' | 'dica'>;

/** RF-51: clique no mapa cria o ponto com os padrões e a fila na partida atual. */
export async function criarPonto(lat: number, lng: number, pontos: Ponto[], partida: Partida | null): Promise<string> {
  const numero = Math.max(0, ...pontos.map((p) => p.numero)) + 1;
  const novo = doc(ref.pontos());
  const b = writeBatch(fs);
  b.set(novo, {
    numero,
    nome: `Ponto ${numero}`,
    lat,
    lng,
    raioM: RAIO_PADRAO_M,
    valorBase: 100,
    passoPct: 0.1,
    pisoPct: 0.2,
    dica: '',
    ativo: true,
    desativadoEm: null,
  });
  if (partida && partida.estado !== 'finalizada') b.set(ref.fila(partida.id, novo.id), { entradas: {} });
  await b.commit();
  return novo.id;
}

export const salvarPonto = (id: string, dados: DadosPonto) => updateDoc(ref.ponto(id), { ...dados });

export const moverPonto = (id: string, lat: number, lng: number) => updateDoc(ref.ponto(id), { lat, lng });

/** RF-52: desativadoEm registrado; balançadas depois disso não pontuam (RF-37). */
export const desativarPonto = (id: string) => updateDoc(ref.ponto(id), { ativo: false, desativadoEm: agoraNoServidor() });

/** Excluir só sem jogo rodando; com a partida ativa ou pausada, o caminho é desativar (RF-52). */
export const podeExcluirPonto = (partida: Partida | null) => !partida || partida.estado === 'rascunho' || partida.estado === 'finalizada';

/**
 * Apaga o ponto e a fila dele na partida atual, e renumera os seguintes para as pistas
 * continuarem 1, 2, 3… Partidas finalizadas não mudam: o ranking final delas está congelado.
 */
export async function excluirPonto(ponto: Ponto, pontos: Ponto[], partida: Partida | null): Promise<void> {
  if (!podeExcluirPonto(partida)) throw new Error('Com a partida em andamento, desative o ponto em vez de excluir.');
  const b = writeBatch(fs);
  b.delete(ref.ponto(ponto.id));
  if (partida && partida.estado === 'rascunho') b.delete(ref.fila(partida.id, ponto.id));
  for (const p of pontos) if (p.numero > ponto.numero) b.update(ref.ponto(p.id), { numero: p.numero - 1 });
  await b.commit();
}

/** RF-53 */
export const anularEntrada = (partidaId: string, pontoId: string, chave: string) =>
  updateDoc(ref.fila(partidaId, pontoId), new FieldPath('entradas', chave, 'anulada'), true);

/** RF-54: Ativa ⇄ Pausada → Finalizada, cada pausa registrada. */
export async function abrirPartida(p: Partida, pontos: Ponto[]): Promise<void> {
  // Garante a fila de cada ponto ativo (pontos criados antes da partida existir).
  const b = writeBatch(fs);
  for (const pt of pontos.filter((x) => x.ativo)) b.set(ref.fila(p.id, pt.id), { entradas: {} }, { merge: true });
  b.update(ref.partida(p.id), { estado: 'ativa' });
  await b.commit();
}

export const pausar = (p: Partida) =>
  updateDoc(ref.partida(p.id), { estado: 'pausada', pausas: [...p.pausas, { de: agoraNoServidor(), ate: null }] });

export const retomar = (p: Partida) =>
  updateDoc(ref.partida(p.id), {
    estado: 'ativa',
    pausas: p.pausas.map((x) => (x.ate == null ? { ...x, ate: agoraNoServidor() } : x)),
  });

/** RF-55: calcula e grava o ranking final a partir do servidor e arquiva a partida. */
export async function finalizar(partidaId: string): Promise<LinhaRanking[]> {
  const [partidaSnap, pontosSnap, filasSnap, jogadoresSnap] = await Promise.all([
    getDocFromServer(ref.partida(partidaId)),
    getDocsFromServer(ref.pontos()),
    getDocsFromServer(ref.filas(partidaId)),
    getDocsFromServer(ref.jogadores()),
  ]);
  const partida = paraPartida(partidaSnap);
  const fim = agoraNoServidor();
  const pausas = partida.pausas.map((x) => (x.ate == null ? { ...x, ate: fim } : x));
  const filas = Object.fromEntries(filasSnap.docs.map((d) => [d.id, paraFila(d)]));
  const r = calcularRanking(pontosSnap.docs.map(paraPonto), filas, { pausas });
  const apelidos = new Map(jogadoresSnap.docs.map((d) => [d.id, d.get('apelido') as string]));
  const balancadas = new Map<string, number>();
  for (const fila of r.filas.values()) for (const e of fila) balancadas.set(e.uid, (balancadas.get(e.uid) ?? 0) + 1);
  const rankingFinal: LinhaRanking[] = r.ranking.map((l) => ({
    uid: l.uid,
    apelido: apelidos.get(l.uid) ?? 'Jogador',
    pontos: l.pontos,
    pos: l.pos,
    balancadas: balancadas.get(l.uid) ?? 0,
  }));
  await updateDoc(ref.partida(partidaId), { estado: 'finalizada', finalizadaEm: fim, pausas, rankingFinal });
  return rankingFinal;
}

/** RF-56: partida vazia com os pontos atuais; as antigas ficam no histórico. */
export async function novaPartida(atual: Partida, pontos: Ponto[]): Promise<void> {
  if (atual.estado !== 'finalizada') throw new Error('Finalize a partida atual primeiro.');
  const nova = doc(ref.partidas());
  const b = writeBatch(fs);
  b.set(nova, { numero: atual.numero + 1, estado: 'rascunho', criadaEm: agoraNoServidor(), finalizadaEm: null, pausas: [], rankingFinal: null });
  for (const p of pontos.filter((x) => x.ativo)) b.set(ref.fila(nova.id, p.id), { entradas: {} });
  b.set(ref.jogo(), { partidaAtual: nova.id });
  await b.commit();
}

/** RF-57: troca o apelido e a reserva normalizada numa transação. */
export async function renomearJogador(uid: string, novo: string): Promise<void> {
  const erro = validarApelido(novo);
  if (erro) throw new Error(erro);
  const limpo = limparApelido(novo);
  const chave = normalizarApelido(limpo);
  await runTransaction(fs, async (tx) => {
    const jog = await tx.get(ref.jogador(uid));
    const reservado = await tx.get(ref.apelido(chave));
    if (reservado.exists() && reservado.get('uid') !== uid) throw new Error('Esse apelido já está em uso.');
    const antigo = jog.get('apelidoNormalizado') as string | undefined;
    if (antigo && antigo !== chave) tx.delete(ref.apelido(antigo));
    tx.set(ref.apelido(chave), { uid, apelido: limpo });
    tx.update(ref.jogador(uid), { apelido: limpo, apelidoNormalizado: chave });
  });
}

/** RF-58: depois de 30 dias, apaga lat/lng/accuracy das balançadas da partida. */
export async function limparLocalizacao(p: Partida): Promise<number> {
  if (p.estado !== 'finalizada' || !p.finalizadaEm || agoraNoServidor() - p.finalizadaEm < RETENCAO_LOCALIZACAO_MS)
    throw new Error('Só depois de 30 dias da finalização.');
  const filas = await getDocsFromServer(collection(fs, 'partidas', p.id, 'filas'));
  let n = 0;
  for (const f of filas.docs) {
    const entradas = Object.keys((f.get('entradas') as DocumentData | undefined) ?? {});
    if (entradas.length === 0) continue;
    const campos: unknown[] = [];
    for (const k of entradas) for (const c of ['lat', 'lng', 'accuracy']) campos.push(new FieldPath('entradas', k, c), null);
    const [primeiro, valor, ...resto] = campos as [FieldPath, null, ...unknown[]];
    await updateDoc(f.ref, primeiro, valor, ...resto);
    n += entradas.length;
  }
  await updateDoc(ref.partida(p.id), { localizacaoApagadaEm: agoraNoServidor() } as UpdateData<DocumentData>);
  return n;
}
