import { Timestamp, type DocumentData, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';
import { SACUDIDAS_MAX, SACUDIDAS_MIN, SACUDIDAS_PADRAO } from '@/dominio/constantes';
import type { Entrada, Fila, Partida, Ponto } from '@/dominio/tipos';

type Snap = QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>;

export const ms = (v: unknown): number | null =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null;

/** serverTimestamps: 'estimate' para a escrita local aparecer antes do eco do servidor. */
const dados = (s: Snap) => s.data({ serverTimestamps: 'estimate' }) ?? {};

export function paraPonto(s: Snap): Ponto {
  const d = dados(s);
  return {
    id: s.id,
    numero: d.numero ?? 0,
    nome: d.nome ?? '',
    lat: d.lat,
    lng: d.lng,
    raioM: d.raioM,
    valorBase: d.valorBase,
    passoPct: d.passoPct,
    pisoPct: d.pisoPct,
    // Pontos criados antes do campo existir valem o padrão.
    sacudidas: Number.isInteger(d.sacudidas) ? Math.min(SACUDIDAS_MAX, Math.max(SACUDIDAS_MIN, d.sacudidas)) : SACUDIDAS_PADRAO,
    ativo: d.ativo !== false,
    desativadoEm: ms(d.desativadoEm),
  };
}

export function paraPartida(s: Snap): Partida {
  const d = dados(s);
  return {
    id: s.id,
    numero: d.numero,
    estado: d.estado,
    criadaEm: ms(d.criadaEm) ?? 0,
    finalizadaEm: ms(d.finalizadaEm),
    pausas: (d.pausas ?? []).map((p: { de: unknown; ate: unknown }) => ({ de: ms(p.de) ?? 0, ate: ms(p.ate) })),
    rankingFinal: d.rankingFinal ?? null,
  };
}

export function paraEntrada(e: DocumentData): Entrada {
  return {
    uid: e.uid,
    dispositivoId: e.dispositivoId,
    v: e.v,
    t: e.t,
    fonte: e.fonte,
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    accuracy: e.accuracy ?? null,
    recebidoEm: ms(e.recebidoEm),
    anulada: e.anulada === true,
  };
}

export function paraFila(s: Snap): Fila {
  const entradas: Record<string, Entrada> = {};
  for (const [k, e] of Object.entries((dados(s).entradas ?? {}) as Record<string, DocumentData>)) entradas[k] = paraEntrada(e);
  return { pontoId: s.id, entradas };
}
