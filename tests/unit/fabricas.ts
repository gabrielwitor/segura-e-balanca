import type { Entrada, Fila, Ponto } from '@/dominio/tipos';

export function ponto(id: string, extra: Partial<Ponto> = {}): Ponto {
  return {
    id, numero: 1, nome: id, lat: -23.5589, lng: -46.7315, raioM: 25,
    valorBase: 100, passoPct: 0.1, pisoPct: 0.2, dica: '', sacudidas: 4, ativo: true, desativadoEm: null,
    ...extra,
  };
}

export function entrada(uid: string, t: number, extra: Partial<Entrada> = {}): Entrada {
  return {
    uid, dispositivoId: 'd1', v: 0, t, fonte: 'monotonica',
    lat: 0, lng: 0, accuracy: 5, recebidoEm: t + 100, anulada: false,
    ...extra,
  };
}

export function fila(pontoId: string, entradas: Record<string, Entrada>): Fila {
  return { pontoId, entradas };
}
