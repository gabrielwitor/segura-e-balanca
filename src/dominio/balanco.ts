import { BALANCO_INTERVALO_MIN_MS, BALANCO_JANELA_MS, BALANCO_LIMIAR_MS2, BALANCO_PICOS } from './constantes';

export interface AmostraAceleracao {
  x: number;
  y: number;
  z: number;
  t: number;
}

/**
 * RF-22 / seção 7.4: ≥ 3 picos acima do limiar em até 2 s, com intervalo mínimo entre eles.
 * Pico = variação de aceleração (com gravidade) entre amostras seguidas, como no shake.js.
 */
export class DetectorDeBalanco {
  private anterior: AmostraAceleracao | null = null;
  private picos: number[] = [];

  /** Devolve true no instante em que o gesto se completa. */
  alimentar(a: AmostraAceleracao): boolean {
    const ant = this.anterior;
    this.anterior = a;
    if (!ant) return false;
    const delta = Math.max(Math.abs(a.x - ant.x), Math.abs(a.y - ant.y), Math.abs(a.z - ant.z));
    if (delta < BALANCO_LIMIAR_MS2) return false;
    const ultimo = this.picos[this.picos.length - 1];
    if (ultimo != null && a.t - ultimo < BALANCO_INTERVALO_MIN_MS) return false;
    this.picos = [...this.picos.filter((t) => a.t - t <= BALANCO_JANELA_MS), a.t];
    if (this.picos.length >= BALANCO_PICOS) {
      this.reiniciar();
      return true;
    }
    return false;
  }

  reiniciar(): void {
    this.anterior = null;
    this.picos = [];
  }
}
