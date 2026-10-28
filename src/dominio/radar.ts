import {
  FAIXA_MORNO_M,
  FAIXA_QUENTE_M,
  HISTERESE_M,
  JANELA_TENDENCIA_MS,
  LIMIAR_TENDENCIA_M,
  PRECISAO_MAX_M,
} from './constantes';
import type { Posicao } from './tipos';

const R_TERRA_M = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;
const graus = (r: number) => (r * 180) / Math.PI;

export function haversine(a: Posicao, b: Posicao): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumo de a para b, em graus a partir do norte, sentido horário. */
export function rumo(a: Posicao, b: Posicao): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (graus(Math.atan2(y, x)) + 360) % 360;
}

/** RF-11: setor de 45° relativo para onde o celular aponta (0 = à frente). */
export function setor(rumoGraus: number, heading: number): number {
  const rel = (rumoGraus - heading + 360) % 360;
  return Math.round(rel / 45) % 8;
}

export type Faixa = 'frio' | 'morno' | 'quente';

/** RF-11 com histerese: só troca de faixa depois de passar a fronteira por HISTERESE_M. */
export function faixaDaDistancia(d: number, anterior?: Faixa): Faixa {
  const ordem: Faixa[] = ['quente', 'morno', 'frio'];
  const limites = [FAIXA_QUENTE_M, FAIXA_MORNO_M];
  const bruta = (dist: number): Faixa => (dist < FAIXA_QUENTE_M ? 'quente' : dist <= FAIXA_MORNO_M ? 'morno' : 'frio');
  if (!anterior) return bruta(d);
  const iAnt = ordem.indexOf(anterior);
  // Para sair da faixa atual é preciso passar do limite dela com folga.
  const limSup = limites[iAnt];
  const limInf = limites[iAnt - 1];
  if (limSup != null && d > limSup + HISTERESE_M) return bruta(d);
  if (limInf != null && d < limInf - HISTERESE_M) return bruta(d);
  return anterior;
}

export type Tendencia = 'esquentando' | 'esfriando' | 'estavel';

export interface AmostraDistancia {
  t: number;
  d: number;
}

/** Seção 7.3: média de d nos últimos ~10 s contra a dos 10 s anteriores. */
export function tendencia(amostras: readonly AmostraDistancia[], agora: number): Tendencia {
  const media = (xs: AmostraDistancia[]) => xs.reduce((s, a) => s + a.d, 0) / xs.length;
  const recentes = amostras.filter((a) => agora - a.t <= JANELA_TENDENCIA_MS);
  const antigas = amostras.filter((a) => agora - a.t > JANELA_TENDENCIA_MS && agora - a.t <= 2 * JANELA_TENDENCIA_MS);
  if (recentes.length === 0) return 'estavel';
  const base = antigas.length > 0 ? media(antigas) : recentes[0]!.d;
  const delta = media(recentes) - base;
  if (delta <= -LIMIAR_TENDENCIA_M) return 'esquentando';
  if (delta >= LIMIAR_TENDENCIA_M) return 'esfriando';
  return 'estavel';
}

export type Alcance = 'dentro' | 'gps-impreciso' | 'fora';

/**
 * RF-20: aceita se distância − accuracy ≤ raio.
 * RF-21: se só passaria graças a uma accuracy grande demais, é "aguardando sinal de GPS".
 */
export function alcance(d: number, accuracy: number, raioM: number): Alcance {
  if (d - accuracy > raioM) return 'fora';
  return accuracy > PRECISAO_MAX_M ? 'gps-impreciso' : 'dentro';
}
