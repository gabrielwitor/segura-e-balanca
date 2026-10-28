import { BALANCO_CARENCIA_MS, BALANCO_INTERVALO_MIN_MS, BALANCO_LIMIAR_MS2, BALANCO_PAUSA_MAX_MS, SACUDIDAS_PADRAO } from './constantes';

export interface AmostraAceleracao {
  x: number;
  y: number;
  z: number;
  t: number;
}

/**
 * RF-22 / seção 7.4: N picos acima do limiar, com intervalo mínimo entre eles e sem pausa longa.
 * Pico = variação de aceleração (com gravidade) entre amostras seguidas, como no shake.js.
 * N vem do ponto (padrão 4). O tranco do toque que arma o gesto não conta (carência).
 */
export class DetectorDeBalanco {
  private anterior: AmostraAceleracao | null = null;
  private picos: number[] = [];
  private inicio: number | null = null;

  constructor(private readonly exigidos: number = SACUDIDAS_PADRAO) {}

  /**
   * Devolve o progresso depois desta amostra: quantos picos valem na janela, se esta amostra
   * foi um pico novo (para o feedback de cada sacudida) e se o gesto se completou.
   */
  alimentar(a: AmostraAceleracao): { picos: number; novoPico: boolean; completo: boolean } {
    const ant = this.anterior;
    this.anterior = a;
    this.inicio ??= a.t;
    // Parou de sacudir por tempo demais: o progresso volta a zero.
    const ultimoPico = this.picos[this.picos.length - 1];
    if (ultimoPico != null && a.t - ultimoPico > BALANCO_PAUSA_MAX_MS) this.picos = [];
    const nada = { picos: this.picos.length, novoPico: false, completo: false };
    if (!ant || a.t - this.inicio < BALANCO_CARENCIA_MS) return nada;
    const delta = Math.max(Math.abs(a.x - ant.x), Math.abs(a.y - ant.y), Math.abs(a.z - ant.z));
    if (delta < BALANCO_LIMIAR_MS2) return nada;
    const ultimo = this.picos[this.picos.length - 1];
    if (ultimo != null && a.t - ultimo < BALANCO_INTERVALO_MIN_MS) return nada;
    this.picos = [...this.picos, a.t];
    if (this.picos.length >= this.exigidos) {
      this.reiniciar();
      return { picos: this.exigidos, novoPico: true, completo: true };
    }
    return { picos: this.picos.length, novoPico: true, completo: false };
  }

  reiniciar(): void {
    this.anterior = null;
    this.picos = [];
    this.inicio = null;
  }
}
