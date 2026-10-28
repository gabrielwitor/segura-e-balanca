import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { calcularRanking, type EntradaNaFila, type StatusEntrada } from '@/dominio/ranking';
import type { Entrada, EstadoConexao, Fila, Partida } from '@/dominio/tipos';
import type { ItemSaida, LinhaSessao, PontoLocal } from '@/sync/db';
import { db, monitor } from './servicos';

export function useConexao(): EstadoConexao {
  return useSyncExternalStore(
    (cb) => monitor.inscrever(cb),
    () => monitor.estado(),
  );
}

/** Relógio de parede que re-renderiza a cada `ms` (para "há X min" e TTL). */
export function useAgora(ms = 15_000): number {
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return agora;
}

export interface Sessao {
  jogador: LinhaSessao | undefined;
  partida: Partida | undefined;
  dispositivoId: string | undefined;
  ultimoPull: number | undefined;
}

export function useSessao(): Sessao | undefined {
  return useLiveQuery(async () => {
    const linhas = await db.sessao.toArray();
    const por = Object.fromEntries(linhas.map((l) => [l.id, l])) as Partial<Record<LinhaSessao['id'], LinhaSessao>>;
    return {
      jogador: por.jogador,
      partida: por.partida?.partida,
      dispositivoId: por.aparelho?.dispositivoId,
      ultimoPull: por.sync?.ultimoPull,
    };
  });
}

export type SituacaoMinha =
  | { tipo: 'pendente' }
  | { tipo: 'rejeitada' }
  | StatusEntrada;

export interface MinhaBalancada {
  chave: string;
  pontoId: string;
  t: number;
  outroAparelho: boolean;
  situacao: SituacaoMinha;
}

export interface DadosDoJogo {
  pontos: PontoLocal[];
  partida: Partida | undefined;
  ranking: ReturnType<typeof calcularRanking>;
  minhas: MinhaBalancada[];
  pendentes: number;
  apelidos: Map<string, string>;
  saida: ItemSaida[];
  /** Filas confirmadas + pendentes, antes do cálculo (para auditoria e debug). */
  filas: Record<string, Fila>;
}

/**
 * Seção 5.2: ranking e "minhas balançadas" = calcularRanking(filas confirmadas + itens da saída).
 * O jogador vê o que fez offline, marcado como pendente.
 */
export function useDadosDoJogo(uid: string | undefined, dispositivoId: string | undefined): DadosDoJogo | undefined {
  return useLiveQuery(async () => {
    const [pontos, filasLocais, saida, sessaoPartida, apelidos] = await Promise.all([
      db.pontos.toArray(),
      db.filas.toArray(),
      db.saida.toArray(),
      db.sessao.get('partida'),
      db.apelidos.toArray(),
    ]);
    const partida = sessaoPartida?.partida;
    const filas: Record<string, Fila> = {};
    for (const f of filasLocais) if (!partida || f.partidaId === partida.id) filas[f.pontoId] = { pontoId: f.pontoId, entradas: { ...f.entradas } };

    const daPartida = saida.filter((i) => i.partidaId === partida?.id);
    for (const item of daPartida) {
      if (item.status === 'rejeitada') continue;
      const fila = (filas[item.pontoId] ??= { pontoId: item.pontoId, entradas: {} });
      if (!fila.entradas[item.chave]) {
        const e: Entrada = { ...item.entrada, recebidoEm: null, anulada: false };
        fila.entradas[item.chave] = e;
      }
    }

    const ranking = calcularRanking(pontos, filas, partida ?? { pausas: [] });
    const pendentesLocais = new Set(daPartida.filter((i) => i.status !== 'rejeitada').map((i) => i.chave));

    const minhas: MinhaBalancada[] = [];
    if (uid) {
      for (const [pontoId, fila] of Object.entries(filas)) {
        for (const [chave, e] of Object.entries(fila.entradas)) {
          if (e.uid !== uid) continue;
          const status = ranking.status.get(chave);
          // Pendente só enquanto não pontua nem perde: se o cálculo já diz conflito/pausa, mostramos isso.
          const situacao: SituacaoMinha =
            pendentesLocais.has(chave) && status?.tipo === 'valida' ? { tipo: 'pendente' } : (status ?? { tipo: 'pendente' });
          minhas.push({ chave, pontoId, t: e.t, outroAparelho: e.dispositivoId !== dispositivoId, situacao });
        }
      }
      for (const item of daPartida) {
        if (item.status === 'rejeitada' && item.entrada.uid === uid)
          minhas.push({ chave: item.chave, pontoId: item.pontoId, t: item.entrada.t, outroAparelho: false, situacao: { tipo: 'rejeitada' } });
      }
      minhas.sort((a, b) => b.t - a.t);
    }

    return {
      pontos,
      partida,
      ranking,
      minhas,
      pendentes: pendentesLocais.size,
      apelidos: new Map(apelidos.map((a) => [a.uid, a.apelido])),
      saida: daPartida,
      filas,
    };
  }, [uid, dispositivoId]);
}

/** Ponto conquistado (ou pendente) por mim nesta partida: não deixa balançar de novo (RF-24). */
export function pontoConquistado(minhas: MinhaBalancada[], pontoId: string): MinhaBalancada | undefined {
  return minhas.find(
    (m) => m.pontoId === pontoId && (m.situacao.tipo === 'valida' || m.situacao.tipo === 'pendente'),
  );
}

export type { EntradaNaFila };
