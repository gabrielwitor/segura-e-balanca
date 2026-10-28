import { BACKOFF_BASE_MS, BACKOFF_JITTER, BACKOFF_MAX_MS } from './constantes';

/** RNF-07: 2 s → 60 s, com jitter de ±20%. `aleatorio` em [0, 1). */
export function esperaDoBackoff(tentativas: number, aleatorio: number = Math.random()): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** tentativas, BACKOFF_MAX_MS);
  return Math.round(base * (1 + BACKOFF_JITTER * (2 * aleatorio - 1)));
}
