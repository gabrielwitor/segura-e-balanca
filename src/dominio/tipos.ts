import { z } from 'zod';

export const PontoSchema = z.object({
  id: z.string(),
  numero: z.number().int().positive(),
  nome: z.string(),
  lat: z.number(),
  lng: z.number(),
  raioM: z.number().positive(),
  valorBase: z.number().positive(),
  /** Fração: 0.1 = 10% por posição. */
  passoPct: z.number().min(0).max(1),
  /** Fração mínima do valor-base. */
  pisoPct: z.number().min(0).max(1),
  dica: z.string().default(''),
  /** Sacudidas exigidas para balançar neste ponto (configurável pelo admin; padrão 4). */
  sacudidas: z.number().int().min(2).max(10),
  ativo: z.boolean(),
  desativadoEm: z.number().nullable(),
});
export type Ponto = z.infer<typeof PontoSchema>;

export const PausaSchema = z.object({ de: z.number(), ate: z.number().nullable() });
export type Pausa = z.infer<typeof PausaSchema>;

export const EstadoPartidaSchema = z.enum(['rascunho', 'ativa', 'pausada', 'finalizada']);
export type EstadoPartida = z.infer<typeof EstadoPartidaSchema>;

export const LinhaRankingSchema = z.object({
  uid: z.string(),
  apelido: z.string(),
  pontos: z.number(),
  pos: z.number(),
  balancadas: z.number(),
});
export type LinhaRanking = z.infer<typeof LinhaRankingSchema>;

export const PartidaSchema = z.object({
  id: z.string(),
  numero: z.number().int().positive(),
  estado: EstadoPartidaSchema,
  criadaEm: z.number(),
  finalizadaEm: z.number().nullable(),
  pausas: z.array(PausaSchema),
  rankingFinal: z.array(LinhaRankingSchema).nullable(),
});
export type Partida = z.infer<typeof PartidaSchema>;

export const FonteHorarioSchema = z.enum(['monotonica', 'relogio-corrigido']);
export type FonteHorario = z.infer<typeof FonteHorarioSchema>;

export const EntradaSchema = z.object({
  uid: z.string(),
  dispositivoId: z.string(),
  v: z.number().int().nonnegative(),
  t: z.number(),
  fonte: FonteHorarioSchema,
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracy: z.number().nullable(),
  /** null enquanto só existe na fila de saída local. */
  recebidoEm: z.number().nullable(),
  anulada: z.boolean(),
});
export type Entrada = z.infer<typeof EntradaSchema>;

/** Uma fila por ponto por partida: `partidas/{p}/filas/{ponto}`. */
export interface Fila {
  pontoId: string;
  entradas: Record<string, Entrada>;
}

export type EstadoConexao = 'online' | 'sem-rede' | 'servidor-indisponivel';

export interface Posicao {
  lat: number;
  lng: number;
}

export const chaveDaEntrada = (uid: string, dispositivoId: string, v: number) => `${uid}_${dispositivoId}_${v}`;
