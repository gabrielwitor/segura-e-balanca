import { emPausa, pontosDaPosicao } from './pontuacao';
import type { Entrada, Fila, Partida, Ponto } from './tipos';

export type StatusEntrada =
  | { tipo: 'valida'; pos: number; pts: number }
  | { tipo: 'conflito'; vencedora: string }
  | { tipo: 'anulada' }
  | { tipo: 'pausa' }
  | { tipo: 'desativado' };

export interface EntradaNaFila extends Entrada {
  chave: string;
  pontoId: string;
}

export interface LinhaTotal {
  uid: string;
  pontos: number;
  /** Posição com empate: mesma pontuação, mesma posição (1, 2, 2, 4). */
  pos: number;
}

export interface ResultadoRanking {
  ranking: LinhaTotal[];
  /** Fila válida de cada ponto, já na ordem de pontuação. */
  filas: Map<string, EntradaNaFila[]>;
  /** Situação de toda entrada vista, por chave. */
  status: Map<string, StatusEntrada>;
}

/** Ordem da fila (RNF-06): horário, depois chegada no servidor (pendente por último), depois chave. */
export function porHorario(a: EntradaNaFila, b: EntradaNaFila): number {
  if (a.t !== b.t) return a.t - b.t;
  const ra = a.recebidoEm ?? Number.POSITIVE_INFINITY;
  const rb = b.recebidoEm ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra < rb ? -1 : 1;
  return a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0;
}

/**
 * Seção 7.1: função pura. Pontuação sempre recalculada a partir das balançadas (RF-41),
 * de modo que todos os aparelhos convergem para o mesmo resultado (RNF-05).
 * Recebe todos os pontos, inclusive desativados: balançadas anteriores à desativação contam.
 */
export function calcularRanking(
  pontos: readonly Ponto[],
  filas: Readonly<Record<string, Fila | undefined>>,
  partida: Pick<Partida, 'pausas'>,
): ResultadoRanking {
  const total = new Map<string, number>();
  const filasValidas = new Map<string, EntradaNaFila[]>();
  const status = new Map<string, StatusEntrada>();

  for (const p of pontos) {
    const todas: EntradaNaFila[] = Object.entries(filas[p.id]?.entradas ?? {}).map(([chave, e]) => ({
      ...e,
      chave,
      pontoId: p.id,
    }));
    const candidatas: EntradaNaFila[] = [];
    for (const e of todas) {
      if (e.anulada) status.set(e.chave, { tipo: 'anulada' });
      else if (emPausa(e.t, partida.pausas)) status.set(e.chave, { tipo: 'pausa' });
      else if (p.desativadoEm != null && e.t >= p.desativadoEm) status.set(e.chave, { tipo: 'desativado' });
      else candidatas.push(e);
    }
    candidatas.sort(porHorario);

    // RF-36: uma entrada por jogador, a de menor horário.
    const vencedoraDe = new Map<string, string>();
    const fila: EntradaNaFila[] = [];
    for (const e of candidatas) {
      const vencedora = vencedoraDe.get(e.uid);
      if (vencedora) {
        status.set(e.chave, { tipo: 'conflito', vencedora });
        continue;
      }
      vencedoraDe.set(e.uid, e.chave);
      fila.push(e);
    }

    fila.forEach((e, i) => {
      const pts = pontosDaPosicao(p, i + 1);
      status.set(e.chave, { tipo: 'valida', pos: i + 1, pts });
      total.set(e.uid, (total.get(e.uid) ?? 0) + pts);
    });
    filasValidas.set(p.id, fila);
  }

  const ordenado = [...total].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const ranking: LinhaTotal[] = [];
  ordenado.forEach(([uid, pontos], i) => {
    const anterior = ranking[i - 1];
    const pos = anterior && anterior.pontos === pontos ? anterior.pos : i + 1;
    ranking.push({ uid, pontos, pos });
  });

  return { ranking, filas: filasValidas, status };
}
