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

  /**
   * Devolve o progresso depois desta amostra: quantos picos valem na janela, se esta amostra
   * foi um pico novo (para o feedback de cada sacudida) e se o gesto se completou.
   */
  alimentar(a: AmostraAceleracao): { picos: number; novoPico: boolean; completo: boolean } {
    const ant = this.anterior;
    this.anterior = a;
    // Picos antigos expiram mesmo sem sacudida nova: o progresso volta a zero se a pessoa parar.
    this.picos = this.picos.filter((t) => a.t - t <= BALANCO_JANELA_MS);
    const nada = { picos: this.picos.length, novoPico: false, completo: false };
    if (!ant) return nada;
    const delta = Math.max(Math.abs(a.x - ant.x), Math.abs(a.y - ant.y), Math.abs(a.z - ant.z));
    if (delta < BALANCO_LIMIAR_MS2) return nada;
    const ultimo = this.picos[this.picos.length - 1];
    if (ultimo != null && a.t - ultimo < BALANCO_INTERVALO_MIN_MS) return nada;
    this.picos = [...this.picos, a.t];
    if (this.picos.length >= BALANCO_PICOS) {
      this.reiniciar();
      return { picos: BALANCO_PICOS, novoPico: true, completo: true };
    }
    return { picos: this.picos.length, novoPico: true, completo: false };
  }

  reiniciar(): void {
    this.anterior = null;
    this.picos = [];
  }
}
