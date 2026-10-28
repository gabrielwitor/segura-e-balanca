import type { Entrada, Fila, Partida, Ponto } from '@/dominio/tipos';

export type CodigoErroRemoto = 'permission-denied' | 'not-found' | 'unavailable' | 'timeout' | 'outro';

export class ErroRemoto extends Error {
  constructor(
    public readonly codigo: CodigoErroRemoto,
    mensagem?: string,
  ) {
    super(mensagem ?? codigo);
    this.name = 'ErroRemoto';
  }
}

export type EntradaParaEnvio = Omit<Entrada, 'recebidoEm' | 'anulada'>;

export interface InstantaneoDaPartida {
  partida: Partida;
  pontos: Ponto[];
  filas: Fila[];
}

export type Cancelar = () => void;

/**
 * Tudo o que o módulo de sync precisa do servidor. A implementação real está em
 * src/firebase/remoto.ts; os testes usam uma falsa. A UI nunca chama isto direto.
 */
export interface Remoto {
  /** Seção 6.2: escrita atômica de uma entrada na fila do ponto. */
  enviarEntrada(partidaId: string, pontoId: string, chave: string, entrada: EntradaParaEnvio): Promise<void>;
  /** Para distinguir "reenvio de algo que já chegou" de "recusa definitiva". */
  entradaExiste(partidaId: string, pontoId: string, chave: string): Promise<boolean>;
  /** Seção 6.1: lê `config/jogo` do servidor. Lança se não responder. */
  heartbeat(): Promise<void>;
  /** Seção 7.2: grava e relê serverTimestamp. */
  horaDoServidor(uid: string): Promise<number>;
  /** RF-04: tudo o que o jogador precisa para jogar offline. */
  baixarPartidaAtual(): Promise<InstantaneoDaPartida | null>;
  registrarParticipacao(uid: string, partidaId: string): Promise<void>;
  baixarHistorico(uid: string): Promise<Partida[]>;

  // Os listeners não entregam o cache em memória vazio do SDK (abrir offline):
  // ele nunca apaga o store local.
  escutarPartidaAtual(cb: (partidaId: string | null) => void, erro: (e: unknown) => void): Cancelar;
  escutarPartida(partidaId: string, cb: (p: Partida) => void, erro: (e: unknown) => void): Cancelar;
  escutarPontos(cb: (pontos: Ponto[]) => void, erro: (e: unknown) => void): Cancelar;
  escutarFilas(partidaId: string, cb: (filas: Fila[]) => void, erro: (e: unknown) => void): Cancelar;
  escutarApelidos(cb: (apelidos: { uid: string; apelido: string }[]) => void, erro: (e: unknown) => void): Cancelar;
}
