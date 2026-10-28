import { NIVEL_ALTO, NIVEL_MEDIO } from './constantes';
import type { Pausa, Ponto } from './tipos';

type Regra = Pick<Ponto, 'valorBase' | 'passoPct' | 'pisoPct'>;

/** RF-40: pontuação da posição p (1 = primeiro). */
export function pontosDaPosicao(ponto: Regra, posicao: number): number {
  return Math.round(ponto.valorBase * Math.max(1 - ponto.passoPct * (posicao - 1), ponto.pisoPct));
}

export type NivelValor = 'alto' | 'medio' | 'baixo';

/** RF-13: nível da próxima balançada, sem expor o número. */
export function nivelDoValor(ponto: Regra, proximaPosicao: number): NivelValor {
  const fracao = pontosDaPosicao(ponto, proximaPosicao) / ponto.valorBase;
  if (fracao >= NIVEL_ALTO) return 'alto';
  if (fracao >= NIVEL_MEDIO) return 'medio';
  return 'baixo';
}

/** Tabela "100 · 90 · 80 · … · 20" do painel do admin, até bater no piso. */
export function tabelaDePontos(ponto: Regra, max = 12): number[] {
  const tabela: number[] = [];
  for (let p = 1; p <= max; p++) {
    const pts = pontosDaPosicao(ponto, p);
    tabela.push(pts);
    if (pts === Math.round(ponto.valorBase * ponto.pisoPct)) break;
  }
  return tabela;
}

/** RF-37: horário dentro de uma pausa (pausa aberta = até agora). */
export function emPausa(t: number, pausas: readonly Pausa[]): boolean {
  return pausas.some((p) => t >= p.de && (p.ate == null || t < p.ate));
}
