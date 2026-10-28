import { useEffect, useState } from 'react';
import { onSnapshot, orderBy, query, where } from 'firebase/firestore';
import type { Fila, Partida, Ponto } from '@/dominio/tipos';
import { paraFila, paraPartida, paraPonto } from '@/firebase/conversores';
import { ref } from '@/firebase/remoto';

export interface Jogador {
  uid: string;
  apelido: string;
}

export interface DadosAdmin {
  partida: Partida | null;
  pontos: Ponto[];
  filas: Record<string, Fila>;
  jogadores: Jogador[];
  historico: Partida[];
  carregado: boolean;
}

/** Listeners em tempo real; o admin trabalha online. */
export function useDadosAdmin(ativo: boolean): DadosAdmin {
  const [partidaId, setPartidaId] = useState<string | null | undefined>(undefined);
  const [partida, setPartida] = useState<Partida | null>(null);
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [historico, setHistorico] = useState<Partida[]>([]);

  useEffect(() => {
    if (!ativo) return;
    const cs = [
      onSnapshot(ref.jogo(), (s) => setPartidaId((s.get('partidaAtual') as string | undefined) ?? null)),
      onSnapshot(ref.pontos(), (s) => setPontos(s.docs.map(paraPonto).sort((a, b) => a.numero - b.numero))),
      onSnapshot(ref.jogadores(), (s) => setJogadores(s.docs.map((d) => ({ uid: d.id, apelido: d.get('apelido') as string })))),
      onSnapshot(query(ref.partidas(), where('estado', '==', 'finalizada'), orderBy('numero', 'desc')), (s) =>
        setHistorico(s.docs.map(paraPartida)),
      ),
    ];
    return () => cs.forEach((c) => c());
  }, [ativo]);

  useEffect(() => {
    if (!ativo || !partidaId) return;
    const cs = [
      onSnapshot(ref.partida(partidaId), (s) => setPartida(s.exists() ? paraPartida(s) : null)),
      onSnapshot(ref.filas(partidaId), (s) => setFilas(Object.fromEntries(s.docs.map((d) => [d.id, paraFila(d)])))),
    ];
    return () => cs.forEach((c) => c());
  }, [ativo, partidaId]);

  return { partida: partidaId ? partida : null, pontos, filas, jogadores, historico, carregado: partidaId !== undefined };
}
