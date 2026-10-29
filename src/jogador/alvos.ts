import { useEffect, useMemo, useRef, useState } from 'react';
import { TTL_VALOR_MS } from '@/dominio/constantes';
import { nivelDoValor, pontosDaPosicao, type NivelValor } from '@/dominio/pontuacao';
import { faixaDaDistancia, haversine, rumo, tendencia, type AmostraDistancia, type Faixa, type Tendencia } from '@/dominio/radar';
import type { PontoLocal } from '@/sync/db';
import { pontoConquistado, useAgora, type DadosDoJogo } from './dados';
import { useBussola, usePosicao, type EstadoGps, type Leitura } from './sensores';

/** O nome que o admin deu; sem nome, "Ponto N". */
export const nomeDoPonto = (p: Pick<PontoLocal, 'numero' | 'nome'>) => p.nome.trim() || `Ponto ${p.numero}`;

export interface Medida {
  d: number;
  faixa: Faixa;
  tendencia: Tendencia;
}

export interface Alvo {
  ponto: PontoLocal;
  medida: Medida | undefined;
  /** Direção do ponto em graus a partir do norte (sem GPS, null). */
  rumo: number | null;
  nivel: NivelValor | 'feito' | 'expirado';
  /** Pontos de quem balançar agora: próxima posição na fila que este aparelho conhece. */
  pts: number;
  conquistado: boolean;
}

export interface Radar {
  gps: EstadoGps;
  leitura: Leitura | null;
  heading: number | null;
  alvos: Alvo[];
  /** Ponto aberto mais perto (ou o primeiro, sem GPS): o padrão da bússola. */
  maisPerto: Alvo | undefined;
  /** Partida ativa com pontos. */
  jogavel: boolean;
}

/**
 * GPS, bússola e medidas de cada ponto, compartilhados pelas abas Radar e Pontos.
 * RNF-10: sensores ligados só enquanto uma dessas abas está aberta (`ligado`).
 */
export function useRadar(dados: DadosDoJogo | undefined, ligado: boolean): Radar {
  const partida = dados?.partida;
  const pontos = dados?.pontos;
  const ativos = useMemo(() => (pontos ?? []).filter((p) => p.ativo).sort((a, b) => a.numero - b.numero), [pontos]);
  const jogavel = partida?.estado === 'ativa' && ativos.length > 0;

  const gps = usePosicao(jogavel && ligado);
  const heading = useBussola(jogavel && ligado);
  const agora = useAgora(10_000);
  const leitura = gps.tipo === 'ok' ? gps.leitura : null;

  // Faixa com histerese e tendência pedem memória entre leituras.
  const memoria = useRef(new Map<string, { faixa: Faixa; amostras: AmostraDistancia[] }>());
  const [medidas, setMedidas] = useState(new Map<string, Medida>());
  useEffect(() => {
    if (!leitura) return;
    const novas = new Map<string, Medida>();
    for (const p of ativos) {
      const d = haversine(leitura, p);
      const m = memoria.current.get(p.id) ?? { faixa: faixaDaDistancia(d), amostras: [] };
      m.faixa = faixaDaDistancia(d, m.faixa);
      m.amostras = [...m.amostras.filter((a) => leitura.t - a.t < 20_000), { t: leitura.t, d }];
      memoria.current.set(p.id, m);
      novas.set(p.id, { d, faixa: m.faixa, tendencia: tendencia(m.amostras, leitura.t) });
    }
    setMedidas(novas);
  }, [leitura, ativos]);

  const alvos: Alvo[] = dados
    ? ativos.map((p) => {
        const conquistado = !!pontoConquistado(dados.minhas, p.id);
        const fila = dados.ranking.filas.get(p.id) ?? [];
        const expirado = agora - p.sincronizadoEm > TTL_VALOR_MS;
        return {
          ponto: p,
          medida: medidas.get(p.id),
          rumo: leitura ? rumo(leitura, p) : null,
          nivel: conquistado ? 'feito' : expirado ? 'expirado' : nivelDoValor(p, fila.length + 1),
          pts: pontosDaPosicao(p, fila.length + 1),
          conquistado,
        };
      })
    : [];
  const maisPerto = [...alvos].sort((a, b) => Number(a.conquistado) - Number(b.conquistado) || (a.medida?.d ?? Infinity) - (b.medida?.d ?? Infinity))[0];

  return { gps, leitura, heading, alvos, maisPerto, jogavel };
}
