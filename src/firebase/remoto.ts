import {
  arrayUnion,
  collection,
  doc,
  documentId,
  FieldPath,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QuerySnapshot,
} from 'firebase/firestore';
import type { Partida } from '@/dominio/tipos';
import { ErroRemoto, type EntradaParaEnvio, type InstantaneoDaPartida, type Remoto } from '@/sync/remoto';
import { firestore as fs } from './app';
import { ms, paraFila, paraPartida, paraPonto } from './conversores';
import { traduzindo } from './erros';

export const ref = {
  jogo: () => doc(fs, 'config', 'jogo'),
  pontos: () => collection(fs, 'pontos'),
  ponto: (id: string) => doc(fs, 'pontos', id),
  partidas: () => collection(fs, 'partidas'),
  partida: (id: string) => doc(fs, 'partidas', id),
  filas: (pid: string) => collection(fs, 'partidas', pid, 'filas'),
  fila: (pid: string, pontoId: string) => doc(fs, 'partidas', pid, 'filas', pontoId),
  jogadores: () => collection(fs, 'jogadores'),
  jogador: (uid: string) => doc(fs, 'jogadores', uid),
  apelido: (normalizado: string) => doc(fs, 'apelidos', normalizado),
  relogio: (uid: string) => doc(fs, 'relogio', uid),
  admin: (uid: string) => doc(fs, 'admins', uid),
};

/** Ao abrir offline, o cache em memória do SDK está vazio: isso não é o estado do servidor. */
const vazioDoCache = (s: QuerySnapshot) => s.metadata.fromCache && s.empty;

export class RemotoFirebase implements Remoto {
  enviarEntrada(partidaId: string, pontoId: string, chave: string, e: EntradaParaEnvio): Promise<void> {
    // FieldPath em vez de "entradas.<chave>": a chave tem hífens do UUID.
    return traduzindo(
      updateDoc(ref.fila(partidaId, pontoId), new FieldPath('entradas', chave), {
        ...e,
        recebidoEm: serverTimestamp(),
        anulada: false,
      }),
    );
  }

  async entradaExiste(partidaId: string, pontoId: string, chave: string): Promise<boolean> {
    const s = await traduzindo(getDocFromServer(ref.fila(partidaId, pontoId)));
    return !!s.get(new FieldPath('entradas', chave));
  }

  async heartbeat(): Promise<void> {
    try {
      await traduzindo(getDocFromServer(ref.jogo()));
    } catch (err) {
      // Recusa das regras (ex.: antes do login) também prova que o servidor respondeu.
      if (err instanceof ErroRemoto && err.codigo === 'permission-denied') return;
      throw err;
    }
  }

  async horaDoServidor(uid: string): Promise<number> {
    await traduzindo(setDoc(ref.relogio(uid), { agora: serverTimestamp() }));
    const s = await traduzindo(getDocFromServer(ref.relogio(uid)));
    const agora = ms(s.get('agora'));
    if (agora == null) throw new Error('Servidor não devolveu a hora');
    return agora;
  }

  async baixarPartidaAtual(): Promise<InstantaneoDaPartida | null> {
    const jogo = await traduzindo(getDocFromServer(ref.jogo()));
    const pid = jogo.get('partidaAtual') as string | undefined;
    if (!pid) return null;
    const [partida, pontos, filas] = await traduzindo(
      Promise.all([getDocFromServer(ref.partida(pid)), getDocsFromServer(ref.pontos()), getDocsFromServer(ref.filas(pid))]),
    );
    if (!partida.exists()) return null;
    return { partida: paraPartida(partida), pontos: pontos.docs.map(paraPonto), filas: filas.docs.map(paraFila) };
  }

  async registrarParticipacao(uid: string, partidaId: string): Promise<void> {
    await traduzindo(updateDoc(ref.jogador(uid), { partidas: arrayUnion(partidaId) }));
  }

  async baixarHistorico(uid: string): Promise<Partida[]> {
    const jogador = await traduzindo(getDocFromServer(ref.jogador(uid)));
    const ids = ((jogador.get('partidas') as string[] | undefined) ?? []).slice(-30);
    if (ids.length === 0) return [];
    const s = await traduzindo(getDocsFromServer(query(ref.partidas(), where(documentId(), 'in', ids))));
    return s.docs.map(paraPartida).filter((p) => p.estado === 'finalizada');
  }

  escutarPartidaAtual(cb: (pid: string | null) => void, erro: (e: unknown) => void) {
    let anterior: string | null | undefined;
    return onSnapshot(
      ref.jogo(),
      (s) => {
        if (s.metadata.fromCache && !s.exists()) return;
        const pid = (s.get('partidaAtual') as string | undefined) ?? null;
        if (pid !== anterior) cb(pid);
        anterior = pid;
      },
      erro,
    );
  }

  escutarPartida(pid: string, cb: (p: Partida) => void, erro: (e: unknown) => void) {
    return onSnapshot(ref.partida(pid), (s) => s.exists() && cb(paraPartida(s)), erro);
  }

  escutarPontos(cb: (p: ReturnType<typeof paraPonto>[]) => void, erro: (e: unknown) => void) {
    return onSnapshot(ref.pontos(), (s) => !vazioDoCache(s) && cb(s.docs.map(paraPonto)), erro);
  }

  escutarFilas(pid: string, cb: (f: ReturnType<typeof paraFila>[]) => void, erro: (e: unknown) => void) {
    return onSnapshot(ref.filas(pid), (s) => !vazioDoCache(s) && cb(s.docs.map(paraFila)), erro);
  }

  escutarApelidos(cb: (a: { uid: string; apelido: string }[]) => void, erro: (e: unknown) => void) {
    return onSnapshot(
      ref.jogadores(),
      (s) => !vazioDoCache(s) && cb(s.docs.map((d) => ({ uid: d.id, apelido: (d.get('apelido') as string) ?? '?' }))),
      erro,
    );
  }
}
