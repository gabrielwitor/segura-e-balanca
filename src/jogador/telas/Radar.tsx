import { useEffect, useMemo, useRef, useState } from 'react';
import { TTL_VALOR_MS } from '@/dominio/constantes';
import { nivelDoValor, type NivelValor } from '@/dominio/pontuacao';
import { alcance, faixaDaDistancia, haversine, rumo, setor, tendencia, type AmostraDistancia, type Alcance, type Faixa, type Tendencia } from '@/dominio/radar';
import { registrarBalancada } from '@/sync/saida';
import type { PontoLocal } from '@/sync/db';
import { Icone } from '@/ui/Icone';
import { pontoConquistado, useAgora, type DadosDoJogo, type Sessao } from '../dados';
import { db, relogio, sync } from '../servicos';
import { pedirPermissaoDeMovimento, useBalanco, useBussola, usePosicao, type Leitura } from '../sensores';
import { destravarSom, tocarSucesso, vibrar } from '../feedback';
import { Cabecalho } from './Cabecalho';
import { EstadoVazio } from './EstadoVazio';
import { Balancou } from './Balancou';

export const nomeDaPista = (p: Pick<PontoLocal, 'numero'>) => `Pista ${p.numero}`;

/** Evento do painel de debug para testar sem acelerômetro (desktop, E2E). */
export const EVENTO_SIMULAR_BALANCO = 'seb:simular-balanco';

interface Medida {
  d: number;
  faixa: Faixa;
  tendencia: Tendencia;
}

interface Alvo {
  ponto: PontoLocal;
  medida: Medida | undefined;
  setor: number | null;
  nivel: NivelValor | 'feito' | 'expirado';
  conquistado: boolean;
}

const BANNERS = {
  frio: { titulo: 'Frio', cls: 'bg-frio text-frio-texto' },
  morno: { titulo: 'Morno', cls: 'bg-morno text-morno-texto' },
  quente: { titulo: 'Quente!', cls: 'bg-quente text-quente-tinta' },
  chegou: { titulo: 'Você chegou!', cls: 'bg-verde text-verde-tinta' },
  feito: { titulo: 'Conquistado', cls: 'bg-apagado text-texto' },
  gps: { titulo: 'Procurando você…', cls: 'bg-painel text-suave border border-borda' },
} as const;

const TEXTO_TENDENCIA: Record<Tendencia, string> = { esquentando: 'esquentando', esfriando: 'esfriando', estavel: 'estável' };

interface Props {
  uid: string;
  apelido: string;
  dados: DadosDoJogo;
  sessao: Sessao;
  irParaRanking: () => void;
}

export function Radar({ uid, apelido, dados, sessao, irParaRanking }: Props) {
  const partida = dados.partida;
  const ativos = useMemo(() => dados.pontos.filter((p) => p.ativo).sort((a, b) => a.numero - b.numero), [dados.pontos]);
  const jogavel = partida?.estado === 'ativa' && ativos.length > 0;

  const gps = usePosicao(jogavel);
  const heading = useBussola(jogavel);
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

  const alvos: Alvo[] = ativos.map((p) => {
    const medida = medidas.get(p.id);
    const conquistado = !!pontoConquistado(dados.minhas, p.id);
    const fila = dados.ranking.filas.get(p.id) ?? [];
    const expirado = agora - p.sincronizadoEm > TTL_VALOR_MS;
    return {
      ponto: p,
      medida,
      setor: leitura && heading != null ? setor(rumo(leitura, p), heading) : null,
      nivel: conquistado ? 'feito' : expirado ? 'expirado' : nivelDoValor(p, fila.length + 1),
      conquistado,
    };
  });

  const [alvoId, setAlvoId] = useState<string | null>(null);
  const alvo =
    alvos.find((a) => a.ponto.id === alvoId) ??
    [...alvos].sort((a, b) => Number(a.conquistado) - Number(b.conquistado) || (a.medida?.d ?? Infinity) - (b.medida?.d ?? Infinity))[0];

  const [resultado, setResultado] = useState<string | null>(null);

  if (!partida || partida.estado !== 'ativa' || ativos.length === 0)
    return (
      <>
        <Cabecalho uid={uid} apelido={apelido} dados={dados} />
        <EstadoVazio partida={partida} semPontos={ativos.length === 0} ultimoPull={sessao.ultimoPull} irParaRanking={irParaRanking} />
      </>
    );

  if (resultado) return <Balancou chave={resultado} dados={dados} voltar={() => setResultado(null)} />;

  return (
    <>
      <Cabecalho uid={uid} apelido={apelido} dados={dados} />
      {gps.tipo === 'negado' ? (
        <p role="alert" className="m-0 rounded-2xl bg-erro-fundo p-4 text-erro-texto">
          A localização foi negada. Libere nas configurações do navegador para o radar funcionar.
        </p>
      ) : (
        alvo && <Banner alvo={alvo} leitura={leitura} />
      )}
      {heading != null && leitura ? (
        <Mostrador alvos={alvos} alvoId={alvo?.ponto.id} escolher={setAlvoId} />
      ) : (
        <ListaDePistas alvos={alvos} alvoId={alvo?.ponto.id} escolher={setAlvoId} />
      )}
      {alvo && <CartaoAlvo alvo={alvo} />}
      <div className="grow" />
      {alvo && <BotaoBalancar uid={uid} alvo={alvo} leitura={leitura} partidaId={partida.id} aoRegistrar={setResultado} />}
    </>
  );
}

function Banner({ alvo, leitura }: { alvo: Alvo; leitura: Leitura | null }) {
  let b: (typeof BANNERS)[keyof typeof BANNERS];
  let sub: string;
  const m = alvo.medida;
  const al = m && leitura ? alcance(m.d, leitura.accuracy, alvo.ponto.raioM) : null;
  if (alvo.conquistado) {
    b = BANNERS.feito;
    sub = 'você já balançou aqui · escolha outra pista';
  } else if (!m || !leitura) {
    b = BANNERS.gps;
    sub = 'aguardando sinal de GPS';
  } else if (al === 'dentro') {
    b = BANNERS.chegou;
    sub = 'dentro da área · pode balançar';
  } else if (al === 'gps-impreciso') {
    b = BANNERS.quente;
    sub = `aguardando sinal de GPS · ±${Math.round(leitura.accuracy)} m`;
  } else if (m.faixa === 'quente') {
    b = BANNERS.quente;
    sub = 'está perto — procure em volta';
  } else {
    b = BANNERS[m.faixa];
    sub = `${TEXTO_TENDENCIA[m.tendencia]} · ${m.faixa === 'frio' ? 'siga o blip' : 'continue'}`;
  }
  return (
    <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${b.cls}`} role="status" aria-live="polite" data-testid="temperatura">
      <div className="flex flex-col gap-0.5">
        <div className="font-display text-[26px] font-bold tracking-tight">{b.titulo}</div>
        <div className="text-sm font-medium">{sub}</div>
      </div>
      <Icone nome="termometro" tamanho={34} />
    </div>
  );
}

const RAIO_BLIP = { frio: 130, morno: 78 } as const;

const ESTILO_BLIP: Record<Alvo['nivel'], { tam: number; cls: string }> = {
  alto: { tam: 20, cls: 'bg-[#F4F7F5] shadow-[0_0_0_5px_rgba(244,247,245,0.22)]' },
  medio: { tam: 15, cls: 'bg-verde' },
  baixo: { tam: 13, cls: 'border-2 border-fraco' },
  expirado: { tam: 15, cls: 'border-2 border-dashed border-suave' },
  feito: { tam: 18, cls: 'bg-apagado text-suave' },
};

const NOME_NIVEL: Record<Alvo['nivel'], string> = {
  alto: 'vale alto',
  medio: 'vale médio',
  baixo: 'vale baixo',
  expirado: 'pontuação disponível',
  feito: 'conquistada',
};

/** RF-10 a RF-15: radar orientado pela bússola, blips quantizados em setor e anel. */
function Mostrador({ alvos, alvoId, escolher }: { alvos: Alvo[]; alvoId: string | undefined; escolher: (id: string) => void }) {
  const alvoQuente = alvos.find((a) => a.ponto.id === alvoId && a.medida?.faixa === 'quente' && !a.conquistado);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-square w-full max-w-[320px]">
        <svg viewBox="0 0 320 320" className="size-full" role="img" aria-label="Radar com as pistas por direção e distância">
          <circle cx="160" cy="160" r="156" className="fill-radar stroke-borda" strokeWidth="2" />
          <circle cx="160" cy="160" r="104" fill="none" className="stroke-borda" strokeWidth="1.5" strokeDasharray="4 6" />
          <circle cx="160" cy="160" r="52" fill="none" className="stroke-borda" strokeWidth="1.5" strokeDasharray="4 6" />
          {[0, 45, 90, 135].map((g) => (
            <line key={g} x1="160" y1="4" x2="160" y2="316" className="stroke-linha" transform={`rotate(${g} 160 160)`} />
          ))}
          <g className="animate-varredura" style={{ transformOrigin: '160px 160px' }}>
            <path d="M160 160 L160 4 A156 156 0 0 1 270.3 49.7 Z" className="fill-verde" opacity="0.1" />
          </g>
          <text x="300" y="100" className="fill-fraco" fontSize="10">
            frio
          </text>
          <text x="246" y="134" className="fill-fraco" fontSize="10">
            morno
          </text>
          <path d="M160 150 L167 168 L160 164 L153 168 Z" className="fill-verde" />
        </svg>
        {alvoQuente && <div className="animate-pulso absolute inset-0 rounded-full border-4 border-quente" aria-hidden="true" />}
        {alvos.map((a) => {
          // RF-12: no anel quente a direção some.
          if (!a.medida || a.setor == null || a.medida.faixa === 'quente') return null;
          const r = RAIO_BLIP[a.medida.faixa];
          const ang = (a.setor * Math.PI) / 4;
          const left = ((160 + r * Math.sin(ang)) / 320) * 100;
          const top = ((160 - r * Math.cos(ang)) / 320) * 100;
          const e = ESTILO_BLIP[a.nivel];
          const sel = a.ponto.id === alvoId;
          return (
            <button
              key={a.ponto.id}
              type="button"
              onClick={() => escolher(a.ponto.id)}
              aria-label={`${nomeDaPista(a.ponto)}, ${a.medida.faixa}, ${NOME_NIVEL[a.nivel]}`}
              aria-pressed={sel}
              className="absolute -ml-[22px] -mt-[22px] flex size-11 items-center justify-center"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <span
                className={`flex items-center justify-center rounded-full ${e.cls} ${sel ? 'ring-2 ring-texto ring-offset-[3px] ring-offset-noite' : ''}`}
                style={{ width: e.tam, height: e.tam }}
              >
                {a.nivel === 'feito' && <Icone nome="check" tamanho={13} strokeWidth={2.5} />}
              </span>
            </button>
          );
        })}
      </div>
      <Legenda />
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap justify-center gap-4 text-xs text-suave" aria-hidden="true">
      <span className="flex items-center gap-1.5">
        <span className="size-3.5 rounded-full bg-[#F4F7F5] shadow-[0_0_0_3px_rgba(244,247,245,0.25)]" />
        vale alto
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-[11px] rounded-full bg-verde" />
        médio
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-[9px] rounded-full border-2 border-fraco" />
        baixo
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex size-4 items-center justify-center rounded-full bg-apagado">
          <Icone nome="check" tamanho={12} strokeWidth={2.5} />
        </span>
        seu
      </span>
    </div>
  );
}

const COR_FAIXA: Record<Faixa, string> = {
  frio: 'bg-frio text-frio-texto',
  morno: 'bg-morno text-morno-texto',
  quente: 'bg-quente text-quente-tinta',
};

/** RF-16: sem bússola, o radar vira lista com temperatura e tendência. */
function ListaDePistas({ alvos, alvoId, escolher }: { alvos: Alvo[]; alvoId: string | undefined; escolher: (id: string) => void }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Pistas">
      {alvos.map((a) => {
        const sel = a.ponto.id === alvoId;
        return (
          <li key={a.ponto.id}>
            <button
              type="button"
              onClick={() => escolher(a.ponto.id)}
              aria-pressed={sel}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2 text-left ${sel ? 'border-texto bg-painel' : 'border-borda'} ${a.conquistado ? 'opacity-60' : ''}`}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                <span
                  className={`flex items-center justify-center rounded-full ${ESTILO_BLIP[a.nivel].cls}`}
                  style={{ width: ESTILO_BLIP[a.nivel].tam, height: ESTILO_BLIP[a.nivel].tam }}
                >
                  {a.conquistado && <Icone nome="check" tamanho={13} strokeWidth={2.5} />}
                </span>
              </span>
              <span className="flex grow flex-col">
                <span className="font-semibold">{nomeDaPista(a.ponto)}</span>
                <span className="text-sm text-suave">{a.conquistado ? 'conquistada' : NOME_NIVEL[a.nivel]}</span>
              </span>
              {a.medida && !a.conquistado ? (
                <span className="flex flex-col items-end gap-0.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${COR_FAIXA[a.medida.faixa]}`}>{a.medida.faixa}</span>
                  <span className="text-xs text-suave">{TEXTO_TENDENCIA[a.medida.tendencia]}</span>
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CartaoAlvo({ alvo }: { alvo: Alvo }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-2xl border border-borda bg-painel px-4 py-3.5" aria-label="Alvo">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-widest text-suave">Alvo · {nomeDaPista(alvo.ponto)}</h2>
        <span className="text-xs text-suave">{NOME_NIVEL[alvo.nivel]}</span>
      </div>
      <p className="m-0 text-base leading-snug">{alvo.ponto.dica || 'Sem dica para esta pista. Siga a temperatura.'}</p>
    </section>
  );
}

/**
 * "Segura e balança": segure o botão e balance o celular (decisão para a questão em aberto da
 * seção 12 — evita balanço acidental no bolso). Soltar dá 0,8 s de folga.
 */
function BotaoBalancar({
  uid,
  alvo,
  leitura,
  partidaId,
  aoRegistrar,
}: {
  uid: string;
  alvo: Alvo;
  leitura: Leitura | null;
  partidaId: string;
  aoRegistrar: (chave: string) => void;
}) {
  const [armado, setArmado] = useState(false);
  const soltar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrando = useRef(false);
  const al: Alcance | null = alvo.medida && leitura ? alcance(alvo.medida.d, leitura.accuracy, alvo.ponto.raioM) : null;
  const pode = al === 'dentro' && !alvo.conquistado;

  const balancar = async () => {
    if (registrando.current || !pode || !leitura) return;
    registrando.current = true;
    setArmado(false);
    try {
      const { t, fonte } = relogio.agoraNoServidor();
      // RF-26: grava na fila de saída antes de qualquer feedback de sucesso.
      const item = await registrarBalancada(db, {
        uid,
        partidaId,
        pontoId: alvo.ponto.id,
        t,
        fonte,
        lat: leitura.lat,
        lng: leitura.lng,
        accuracy: leitura.accuracy,
      });
      vibrar();
      tocarSucesso();
      aoRegistrar(item.chave);
      void sync.sincronizar();
    } finally {
      registrando.current = false;
    }
  };

  useBalanco(armado && pode, () => void balancar());

  const balancarRef = useRef(balancar);
  useEffect(() => {
    balancarRef.current = balancar;
  });
  useEffect(() => {
    if (!pode) return;
    const f = () => void balancarRef.current();
    window.addEventListener(EVENTO_SIMULAR_BALANCO, f);
    return () => window.removeEventListener(EVENTO_SIMULAR_BALANCO, f);
  }, [pode]);

  const armar = () => {
    if (!pode) return;
    destravarSom();
    void pedirPermissaoDeMovimento();
    if (soltar.current) clearTimeout(soltar.current);
    setArmado(true);
  };
  const desarmar = () => {
    if (soltar.current) clearTimeout(soltar.current);
    soltar.current = setTimeout(() => setArmado(false), 800);
  };

  if (!pode) {
    const texto = alvo.conquistado
      ? 'Você já balançou aqui'
      : al === 'gps-impreciso' || !leitura
        ? 'Aguardando sinal de GPS…'
        : 'Chegue na área para balançar';
    return (
      <button
        type="button"
        disabled
        data-testid="balancar"
        className="mb-4 h-16 rounded-2xl border-2 border-dashed border-apagado font-display text-[17px] font-semibold text-suave"
      >
        {texto}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="balancar"
      onPointerDown={armar}
      onPointerUp={desarmar}
      onPointerCancel={desarmar}
      onPointerLeave={desarmar}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && armar()}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && desarmar()}
      onContextMenu={(e) => e.preventDefault()}
      aria-describedby="como-balancar"
      className={`mb-4 flex h-16 select-none flex-col items-center justify-center rounded-2xl font-display text-[22px] font-bold transition-colors [-webkit-touch-callout:none] ${
        armado ? 'bg-texto text-verde-tinta shadow-[0_0_0_10px_rgba(67,224,138,0.35)]' : 'bg-verde text-verde-tinta shadow-[0_0_0_6px_rgba(67,224,138,0.18)]'
      }`}
    >
      {armado ? 'Balança!' : 'Segura e balança!'}
      <span id="como-balancar" className="font-sans text-xs font-semibold opacity-80">
        {armado ? 'sacuda o celular com força' : 'segure o botão e sacuda'}
      </span>
    </button>
  );
}
