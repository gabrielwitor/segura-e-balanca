import type { Entrada, Fila, Partida, Ponto } from '@/dominio/tipos';
import { ErroRemoto, type EntradaParaEnvio, type Remoto } from '@/sync/remoto';

/** Servidor em memória com as mesmas regras de idempotência e finalização. */
export class RemotoFalso implements Remoto {
  filas = new Map<string, Record<string, Entrada>>();
  estado: 'ativa' | 'finalizada' = 'ativa';
  fora = false;
  relogioServidor = 1_000_000;
  envios = 0;
  private recebidos = 0;

  private chaveFila(pid: string, ponto: string) {
    return `${pid}/${ponto}`;
  }

  async enviarEntrada(partidaId: string, pontoId: string, chave: string, e: EntradaParaEnvio): Promise<void> {
    this.envios++;
    if (this.fora) throw new ErroRemoto('unavailable');
    if (this.estado === 'finalizada') throw new ErroRemoto('permission-denied');
    const k = this.chaveFila(partidaId, pontoId);
    const fila = this.filas.get(k) ?? {};
    // A regra real recusa mudar uma entrada existente (recebidoEm muda a cada envio).
    if (fila[chave]) throw new ErroRemoto('permission-denied');
    fila[chave] = { ...e, recebidoEm: ++this.recebidos, anulada: false };
    this.filas.set(k, fila);
  }
  async entradaExiste(partidaId: string, pontoId: string, chave: string) {
    if (this.fora) throw new ErroRemoto('unavailable');
    return !!this.filas.get(this.chaveFila(partidaId, pontoId))?.[chave];
  }
  async heartbeat() {
    if (this.fora) throw new ErroRemoto('unavailable');
  }
  async horaDoServidor() {
    return this.relogioServidor;
  }
  async baixarPartidaAtual() {
    return null;
  }
  async registrarParticipacao() {}
  async baixarHistorico(): Promise<Partida[]> {
    return [];
  }
  escutarPartidaAtual() {
    return () => {};
  }
  escutarPartida() {
    return () => {};
  }
  escutarPontos(_cb: (p: Ponto[]) => void) {
    return () => {};
  }
  escutarFilas(_pid: string, _cb: (f: Fila[]) => void) {
    return () => {};
  }
  escutarApelidos() {
    return () => {};
  }
}
