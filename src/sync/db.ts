import Dexie, { type EntityTable } from 'dexie';
import type { Partida, Ponto, Fila, EstadoConexao } from '@/dominio/tipos';
import type { EntradaParaEnvio } from './remoto';

/** Seção 5.2: o armazenamento local é nosso, para ser inspecionável e demonstrável. */

export interface LinhaSessao {
  id: 'aparelho' | 'jogador' | 'partida' | 'sync';
  // aparelho
  dispositivoId?: string;
  proximoV?: number;
  // jogador
  uid?: string;
  apelido?: string;
  email?: string | null;
  partidaId?: string | null;
  // partida (snapshot do documento)
  partida?: Partida;
  // sync
  ultimoPull?: number;
  estadoConexao?: EstadoConexao;
}

export interface PontoLocal extends Ponto {
  /** Base do TTL do valor (RF-17). */
  sincronizadoEm: number;
}

export interface FilaLocal extends Fila {
  partidaId: string;
}

export type StatusSaida = 'pendente' | 'enviando' | 'rejeitada';

export interface ItemSaida {
  chave: string;
  partidaId: string;
  pontoId: string;
  entrada: EntradaParaEnvio;
  status: StatusSaida;
  tentativas: number;
  proximaTentativa: number;
  erro: string | null;
  criadoEm: number;
}

export interface LinhaRelogio {
  id: 'desvio';
  /** servidor − Date.now() */
  desvio: number;
  ancoradoEm: number;
}

export interface LinhaHistorico {
  partidaId: string;
  numero: number;
  finalizadaEm: number | null;
  pos: number | null;
  pontos: number;
  balancadas: number;
  jogadores: number;
}

export interface LinhaApelido {
  uid: string;
  apelido: string;
}

export type BancoLocal = Dexie & {
  sessao: EntityTable<LinhaSessao, 'id'>;
  pontos: EntityTable<PontoLocal, 'id'>;
  filas: EntityTable<FilaLocal, 'pontoId'>;
  saida: EntityTable<ItemSaida, 'chave'>;
  relogio: EntityTable<LinhaRelogio, 'id'>;
  historico: EntityTable<LinhaHistorico, 'partidaId'>;
  apelidos: EntityTable<LinhaApelido, 'uid'>;
};

export function abrirBanco(nome = 'segura-e-balanca'): BancoLocal {
  const db = new Dexie(nome) as BancoLocal;
  db.version(1).stores({
    sessao: 'id',
    pontos: 'id',
    filas: 'pontoId',
    saida: 'chave, status, criadoEm',
    relogio: 'id',
    historico: 'partidaId',
    apelidos: 'uid',
  });
  return db;
}

/** UUID do aparelho, criado no 1º uso (glossário: Dispositivo). */
export async function obterAparelho(db: BancoLocal): Promise<{ dispositivoId: string }> {
  return db.transaction('rw', db.sessao, async () => {
    const atual = await db.sessao.get('aparelho');
    if (atual?.dispositivoId) return { dispositivoId: atual.dispositivoId };
    const dispositivoId = crypto.randomUUID();
    await db.sessao.put({ id: 'aparelho', dispositivoId, proximoV: 0 });
    return { dispositivoId };
  });
}

/** Troca de partida: descarta filas e pontos da anterior; pendências ficam (vão ser recusadas). */
export async function limparPartida(db: BancoLocal): Promise<void> {
  await db.transaction('rw', db.filas, db.pontos, async () => {
    await db.filas.clear();
    await db.pontos.clear();
  });
}
