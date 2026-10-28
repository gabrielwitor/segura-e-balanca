import { DIVERGENCIA_ANCORA_MS } from './constantes';
import type { FonteHorario } from './tipos';

/** Seção 7.2: par (hora do servidor, performance.now()) capturado online. */
export interface Ancora {
  servidor: number;
  perf: number;
}

/** t0/t1 = performance.now() antes e depois da ida ao servidor. */
export function calcularAncora(servidorMs: number, t0: number, t1: number, dateNow: number): { ancora: Ancora; desvio: number } {
  const ancora = { servidor: servidorMs + (t1 - t0) / 2, perf: t1 };
  return { ancora, desvio: ancora.servidor - dateNow };
}

/** RF-25: horário da balançada; nunca a hora crua do sistema. */
export function horarioAncorado(
  ancora: Ancora | null,
  desvio: number,
  perfNow: number,
  dateNow: number,
): { t: number; fonte: FonteHorario } {
  if (ancora) return { t: Math.round(ancora.servidor + (perfNow - ancora.perf)), fonte: 'monotonica' };
  return { t: Math.round(dateNow + desvio), fonte: 'relogio-corrigido' };
}

/** Ao voltar de visibilitychange: âncora e relógio corrigido discordam? (aparelho dormiu) */
export function ancoraDivergente(ancora: Ancora, desvio: number, perfNow: number, dateNow: number): boolean {
  const pelaAncora = ancora.servidor + (perfNow - ancora.perf);
  return Math.abs(pelaAncora - (dateNow + desvio)) > DIVERGENCIA_ANCORA_MS;
}
