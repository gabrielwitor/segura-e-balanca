import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { TTL_VALOR_MS } from '@/dominio/constantes';
import { nivelDoValor, type NivelValor } from '@/dominio/pontuacao';
import { alcance, faixaDaDistancia, haversine, rumo, setor, tendencia, type AmostraDistancia, type Alcance, type Faixa, type Tendencia } from '@/dominio/radar';
import { registrarBalancada } from '@/sync/saida';
import type { PontoLocal } from '@/sync/db';
import { Icone } from '@/ui/Icone';
import { pontoConquistado, useAgora, useConexao, type DadosDoJogo, type Sessao } from '../dados';
import { db, relogio, sync } from '../servicos';
import { pedirLocalizacao, pedirPermissaoDeMovimento, permissaoDeMovimento, useBalanco, useBussola, usePosicao, type Leitura } from '../sensores';
import { destravarSom, feedback, precisaDeToqueParaFeedback } from '../feedback';
import { Cabecalho } from './Cabecalho';
import { EstadoVazio } from './EstadoVazio';
import { Balancou } from './Balancou';
import { PermissaoNegada } from './PermissaoNegada';

export const nomeDaPista = (p: Pick<PontoLocal, 'numero'>) => `Pista ${p.numero}`;

/** Evento do painel de debug para testar sem acelerômetro (desktop, E2E). */
export const EVENTO_SIMULAR_BALANCO = 'seb:simular-balanco';

/** Intervalo do bipe do radar no quente (ms). */
const TICK_QUENTE_MS = 600;

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

const ORDEM_FAIXA: Record<Faixa, number> = { frio: 0, morno: 1, quente: 2 };

const TEXTO_TENDENCIA: Record<Tendencia, string> = { esquentando: 'Esquentando', esfriando: 'Esfriando', estavel: 'Parado' };

const NOME_NIVEL: Record<Alvo['nivel'], string> = {
  alto: 'vale alto',
  medio: 'vale médio',
  baixo: 'vale baixo',
  expirado: 'pontuação disponível',
  feito: 'conquistada',
};

interface Props {
  uid: string;
  apelido: string;
  dados: DadosDoJogo;
  sessao: Sessao;
  irParaRanking: () => void;
  /** Avisa quando está balançando ou mostrando o resultado (o pai desliga o puxar para atualizar). */
  aoOcupar?: (ocupado: boolean) => void;
}

export function Radar({ uid, apelido, dados, sessao, irParaRanking, aoOcupar }: Props) {
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
  const maisPerto = [...alvos].sort((a, b) => Number(a.conquistado) - Number(b.conquistado) || (a.medida?.d ?? Infinity) - (b.medida?.d ?? Infinity))[0];
  const alvo = alvos.find((a) => a.ponto.id === alvoId) ?? maisPerto;
  const al: Alcance | null = alvo?.medida && leitura ? alcance(alvo.medida.d, leitura.accuracy, alvo.ponto.raioM) : null;

  useFeedbackDoRadar(alvo, al, jogavel);

  const movimentoLiberado = useSyncExternalStore(permissaoDeMovimento.inscrever, permissaoDeMovimento.liberada);
  const [guiaLocalizacao, setGuiaLocalizacao] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [armado, setArmado] = useState(false);
  const [picos, setPicos] = useState(0);
  const picosRef = useRef(0);
  const [fraco, setFraco] = useState(false);
  useEffect(() => aoOcupar?.(armado || resultado != null), [armado, resultado, aoOcupar]);

  if (!partida || partida.estado !== 'ativa' || ativos.length === 0)
    return (
      <>
        <Cabecalho uid={uid} apelido={apelido} dados={dados} />
        <EstadoVazio
          partida={partida}
          semPontos={ativos.length === 0}
          ultimoPull={sessao.ultimoPull}
          minhaPosicao={dados.ranking.ranking.find((l) => l.uid === uid)}
          irParaRanking={irParaRanking}
        />
      </>
    );

  if (guiaLocalizacao)
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-noite">
        <PermissaoNegada aoTentar={() => void pedirLocalizacao().then((r) => r !== 'negada' && setGuiaLocalizacao(false))} aoVerRanking={irParaRanking} />
      </div>
    );

  if (resultado)
    return (
      <Balancou
        chave={resultado}
        dados={dados}
        voltar={() => {
          setResultado(null);
          setAlvoId(null); // volta para a pista aberta mais perto
        }}
        irParaRanking={irParaRanking}
      />
    );

  return (
    <>
      {armado ? (
        <Balancando picos={picos} exigidos={alvo?.ponto.sacudidas ?? 4} fraco={fraco} />
      ) : (
        <>
          <Cabecalho uid={uid} apelido={apelido} dados={dados} />
          {gps.tipo === 'negado' ? (
            <div role="alert" className="flex items-center gap-3 rounded-2xl bg-erro-fundo py-3 pr-3 pl-4 text-erro-texto">
              <Icone nome="localNegado" tamanho={22} className="shrink-0" />
              <span className="grow font-semibold">Localização negada</span>
              <button type="button" onClick={() => setGuiaLocalizacao(true)} className="h-11 shrink-0 rounded-xl bg-texto px-4 text-sm font-bold text-noite">
                Como liberar
              </button>
            </div>
          ) : (
            alvo && <Banner alvo={alvo} leitura={leitura} al={al} />
          )}
          {!movimentoLiberado && (
            <button
              type="button"
              onClick={() => void pedirPermissaoDeMovimento()}
              className="flex min-h-12 items-center gap-3 rounded-2xl border border-alerta-borda bg-alerta-fundo px-4 text-left font-semibold text-morno-texto"
            >
              <Icone nome="balancar" tamanho={22} />
              <span className="grow">Ativar sensores</span>
              <Icone nome="avancar" tamanho={18} />
            </button>
          )}
          {heading != null && leitura ? (
            <>
              <Mostrador alvos={alvos} alvoId={alvo?.ponto.id} escolher={setAlvoId} />
              {alvo && <CartaoAlvo alvo={alvo} />}
            </>
          ) : (
            <ListaDePistas alvos={alvos} alvoId={alvo?.ponto.id} escolher={setAlvoId} />
          )}
        </>
      )}
      <div className="grow" />
      {alvo && (
        <BotaoBalancar
          uid={uid}
          alvo={alvo}
          al={al}
          leitura={leitura}
          partidaId={partida.id}
          armado={armado}
          setArmado={(a) => {
            setArmado(a);
            if (!a) {
              picosRef.current = 0;
              setPicos(0);
              setFraco(false);
            }
          }}
          aoProgresso={(n, novo) => {
            // Picos expiraram sem completar: balanço fraco ou devagar demais.
            if (!novo && n === 0 && picosRef.current > 0) {
              setFraco(true);
              feedback.balancoFraco();
            }
            if (novo) {
              setFraco(false);
              if (n < (alvo?.ponto.sacudidas ?? 4)) feedback.pico(n, alvo?.ponto.sacudidas ?? 4);
            }
            picosRef.current = n;
            setPicos(n);
          }}
          aoRegistrar={setResultado}
        />
      )}
    </>
  );
}

/** Sons e vibração do radar: mudança de faixa, chegada na área e bipe no quente. */
function useFeedbackDoRadar(alvo: Alvo | undefined, al: Alcance | null, jogavel: boolean) {
  const faixa = alvo && !alvo.conquistado ? alvo.medida?.faixa : undefined;
  const alvoId = alvo?.ponto.id;
  const anterior = useRef<{ id?: string; faixa?: Faixa; dentro: boolean }>({ dentro: false });

  useEffect(() => {
    const a = anterior.current;
    const dentro = al === 'dentro';
    // Trocar de pista não conta como esquentar/esfriar.
    if (a.id === alvoId && faixa && a.faixa && faixa !== a.faixa) {
      if (ORDEM_FAIXA[faixa] > ORDEM_FAIXA[a.faixa]) feedback.esquentou();
      else feedback.esfriou();
    }
    if (a.id === alvoId && dentro && !a.dentro) feedback.entrouNaArea();
    anterior.current = { id: alvoId, faixa, dentro };
  }, [alvoId, faixa, al]);

  // Bipe tipo detector de metal só no quente, fora da área, com a tela visível (RNF-10).
  const bipar = jogavel && faixa === 'quente' && al !== 'dentro';
  useEffect(() => {
    if (!bipar) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') feedback.tickRadar();
    }, TICK_QUENTE_MS);
    return () => clearInterval(id);
  }, [bipar]);
}

const NIVEL_TERMOMETRO: Record<string, number> = { frio: 1, morno: 3, quente: 4, chegou: 5 };

function Banner({ alvo, leitura, al }: { alvo: Alvo; leitura: Leitura | null; al: Alcance | null }) {
  const m = alvo.medida;
  let v: { titulo: string; sub: string; cls: string; nivel: number; barra: string };
  if (alvo.conquistado) v = { titulo: 'Conquistada', sub: 'Escolha outra pista', cls: 'bg-apagado text-texto', nivel: 0, barra: 'bg-texto' };
  else if (!m || !leitura) v = { titulo: 'Procurando você…', sub: 'Aguardando o GPS', cls: 'bg-painel text-suave border border-borda', nivel: 0, barra: 'bg-suave' };
  else if (al === 'dentro') v = { titulo: 'Você chegou!', sub: 'Pode balançar', cls: 'bg-verde text-verde-tinta', nivel: NIVEL_TERMOMETRO.chegou!, barra: 'bg-verde-tinta' };
  else if (al === 'gps-impreciso')
    v = { titulo: 'Quase lá', sub: 'GPS fraco · vá para céu aberto', cls: 'bg-quente text-quente-tinta', nivel: NIVEL_TERMOMETRO.quente!, barra: 'bg-quente-tinta' };
  else if (m.faixa === 'quente') v = { titulo: 'Quente!', sub: 'Procure em volta', cls: 'bg-quente text-quente-tinta', nivel: NIVEL_TERMOMETRO.quente!, barra: 'bg-quente-tinta' };
  else if (m.faixa === 'morno') v = { titulo: 'Morno', sub: TEXTO_TENDENCIA[m.tendencia], cls: 'bg-morno text-morno-texto', nivel: NIVEL_TERMOMETRO.morno!, barra: 'bg-morno-texto' };
  else v = { titulo: 'Frio', sub: TEXTO_TENDENCIA[m.tendencia], cls: 'bg-frio text-frio-texto', nivel: NIVEL_TERMOMETRO.frio!, barra: 'bg-frio-texto' };

  return (
    <div className={`flex items-center gap-4 rounded-[18px] px-4 py-3.5 ${v.cls}`} role="status" aria-live="polite" data-testid="temperatura">
      <div className="flex grow flex-col gap-1">
        <div className="font-display text-[28px] leading-none font-bold">{v.titulo}</div>
        <div className="text-[15px] font-semibold">{v.sub}</div>
      </div>
      <div className="flex h-10 items-end gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`w-2 rounded-[3px] ${i <= v.nivel ? v.barra : 'bg-fraco/35'}`} style={{ height: 12 + i * 5 }} />
        ))}
      </div>
    </div>
  );
}

const RAIO_BLIP = { frio: 122, morno: 74 } as const;

const ESTILO_BLIP: Record<Alvo['nivel'], { tam: number; cls: string }> = {
  alto: { tam: 20, cls: 'bg-[#F4F7F5] shadow-[0_0_0_5px_rgba(244,247,245,0.22)]' },
  medio: { tam: 15, cls: 'bg-verde' },
  baixo: { tam: 14, cls: 'border-2 border-fraco' },
  expirado: { tam: 15, cls: 'border-2 border-dashed border-suave' },
  feito: { tam: 20, cls: 'bg-apagado text-suave' },
};

/** RF-10 a RF-15: radar orientado pela bússola, blips quantizados em setor e anel. */
function Mostrador({ alvos, alvoId, escolher }: { alvos: Alvo[]; alvoId: string | undefined; escolher: (id: string) => void }) {
  const alvoQuente = alvos.find((a) => a.ponto.id === alvoId && a.medida?.faixa === 'quente' && !a.conquistado);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px] shrink-0">
      <svg viewBox="0 0 300 300" className="size-full" role="img" aria-label="Radar com as pistas por direção e distância">
        <circle cx="150" cy="150" r="146" className="fill-radar stroke-borda" strokeWidth="2" />
        <circle cx="150" cy="150" r="98" fill="none" className="stroke-borda" strokeWidth="1.5" strokeDasharray="4 6" />
        <circle cx="150" cy="150" r="49" fill="none" className="stroke-borda" strokeWidth="1.5" strokeDasharray="4 6" />
        <line x1="150" y1="4" x2="150" y2="296" className="stroke-linha" />
        <line x1="4" y1="150" x2="296" y2="150" className="stroke-linha" />
        <g className="animate-varredura" style={{ transformOrigin: '150px 150px', animationDuration: alvoQuente ? '1.5s' : undefined }}>
          <path d="M150 150 L150 4 A146 146 0 0 1 253.2 46.8 Z" className="fill-verde" opacity="0.1" />
        </g>
        <text x="150" y="22" textAnchor="middle" className="fill-suave" fontSize="12" fontWeight="700">
          N
        </text>
        <path d="M150 139 L158 160 L150 155 L142 160 Z" className="fill-verde" />
      </svg>
      {alvoQuente && <div className="animate-pulso absolute inset-0 rounded-full border-4 border-quente" aria-hidden="true" />}
      {alvos.map((a) => {
        // RF-12: no anel quente a direção some.
        if (!a.medida || a.setor == null || a.medida.faixa === 'quente') return null;
        const r = RAIO_BLIP[a.medida.faixa];
        const ang = (a.setor * Math.PI) / 4;
        const e = ESTILO_BLIP[a.nivel];
        const sel = a.ponto.id === alvoId;
        return (
          <button
            key={a.ponto.id}
            type="button"
            onClick={() => escolher(a.ponto.id)}
            aria-label={`${nomeDaPista(a.ponto)}, ${a.medida.faixa}, ${NOME_NIVEL[a.nivel]}`}
            aria-pressed={sel}
            className="absolute -mt-[22px] -ml-[22px] flex size-11 items-center justify-center"
            style={{ left: `${((150 + r * Math.sin(ang)) / 300) * 100}%`, top: `${((150 - r * Math.cos(ang)) / 300) * 100}%` }}
          >
            <span
              className={`flex items-center justify-center rounded-full ${e.cls} ${sel ? 'ring-[3px] ring-texto ring-offset-[3px] ring-offset-noite' : ''}`}
              style={{ width: e.tam, height: e.tam }}
            >
              {a.nivel === 'feito' && <Icone nome="check" tamanho={12} strokeWidth={2.4} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const COR_FAIXA: Record<Faixa, string> = {
  frio: 'bg-frio text-frio-texto',
  morno: 'bg-morno text-morno-texto',
  quente: 'bg-quente text-quente-tinta',
};

const SETA_TENDENCIA: Record<Tendencia, string> = { esquentando: '↑ esquentando', esfriando: '↓ esfriando', estavel: '= parado' };

/** RF-16: sem bússola, o radar vira lista com temperatura e tendência. A dica abre na pista escolhida. */
function ListaDePistas({ alvos, alvoId, escolher }: { alvos: Alvo[]; alvoId: string | undefined; escolher: (id: string) => void }) {
  return (
    <>
      <h1 className="m-0 font-display text-2xl font-bold">Pistas</h1>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Pistas">
        {alvos.map((a) => {
          const sel = a.ponto.id === alvoId;
          const e = ESTILO_BLIP[a.nivel];
          return (
            <li key={a.ponto.id}>
              <button
                type="button"
                onClick={() => escolher(a.ponto.id)}
                aria-expanded={sel}
                className={`flex w-full flex-col gap-2.5 rounded-[18px] border-2 px-4 py-3.5 text-left ${sel ? 'border-texto bg-painel' : 'border-borda'} ${a.conquistado ? 'opacity-70' : ''}`}
              >
                <span className="flex w-full items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    <span className={`rounded-full ${e.cls}`} style={{ width: Math.min(e.tam, 18), height: Math.min(e.tam, 18) }} />
                  </span>
                  <span className="flex grow flex-col">
                    <span className="text-[17px] font-bold">{nomeDaPista(a.ponto)}</span>
                    <span className="text-[13px] text-suave">{NOME_NIVEL[a.nivel]}</span>
                  </span>
                  {a.conquistado ? (
                    <span className="flex items-center rounded-full bg-apagado px-3 py-1 text-texto">
                      <Icone nome="check" tamanho={16} strokeWidth={2.4} />
                    </span>
                  ) : a.medida ? (
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full px-3 py-1 text-sm font-bold ${COR_FAIXA[a.medida.faixa]}`}>{a.medida.faixa}</span>
                      <span className="text-xs font-semibold text-suave">{SETA_TENDENCIA[a.medida.tendencia]}</span>
                    </span>
                  ) : null}
                </span>
                {sel && <span className="block border-t border-borda pt-2.5 text-[15px] leading-snug">{a.ponto.dica || 'Siga a temperatura.'}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function CartaoAlvo({ alvo }: { alvo: Alvo }) {
  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-borda bg-painel px-4 py-3" aria-label="Pista escolhida">
      <h2 className="m-0 text-xs font-bold tracking-widest text-suave uppercase">
        {nomeDaPista(alvo.ponto)} · {NOME_NIVEL[alvo.nivel]}
      </h2>
      <p className="m-0 text-[15px] leading-snug">{alvo.ponto.dica || 'Siga a temperatura.'}</p>
    </section>
  );
}

/** Até este número de sacudidas o anel é dividido em fatias; acima, vira um anel contínuo. */
const FATIAS_MAX = 12;

/** Tela "Balançando": o anel enche a cada sacudida que conta. */
function Balancando({ picos, exigidos, fraco }: { picos: number; exigidos: number; fraco: boolean }) {
  const titulo = picos >= exigidos ? 'Balançou!' : picos === 0 ? 'Sacuda!' : picos === exigidos - 1 ? 'Mais uma!' : 'Isso! De novo';
  const fatia = 360 / exigidos;
  const folga = Math.min(8, fatia / 6);
  const c = 120, r = 100;
  const ponto = (g: number) => {
    const a = ((g - 90) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  };
  const arco = (de: number, ate: number) => {
    const [x1, y1] = ponto(de);
    const [x2, y2] = ponto(ate);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  return (
    <div className="flex grow flex-col items-center justify-center gap-6" role="status" aria-live="assertive" data-testid="balancando">
      <div className="relative size-60">
        <svg viewBox="0 0 240 240" className="size-full" aria-hidden="true">
          {exigidos <= FATIAS_MAX ? (
            Array.from({ length: exigidos }, (_, i) => (
              <path
                key={i}
                d={arco(i * fatia + folga, (i + 1) * fatia - folga)}
                fill="none"
                strokeWidth="18"
                strokeLinecap="round"
                className={`transition-[stroke] duration-150 ${i < picos ? 'stroke-verde' : 'stroke-[#1F3329]'}`}
              />
            ))
          ) : (
            // Muitas sacudidas: um anel contínuo que enche pela proporção.
            <>
              <circle cx={c} cy={c} r={r} fill="none" strokeWidth="18" className="stroke-[#1F3329]" />
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                strokeWidth="18"
                strokeLinecap="round"
                strokeDasharray={`${(2 * Math.PI * r * Math.min(picos, exigidos)) / exigidos} ${2 * Math.PI * r}`}
                transform={`rotate(-90 ${c} ${c})`}
                className="stroke-verde transition-[stroke-dasharray] duration-150"
              />
            </>
          )}
        </svg>
        <span className={`absolute inset-0 m-auto flex size-24 items-center justify-center rounded-[28px] ${picos >= exigidos ? 'bg-verde text-verde-tinta' : 'animate-sacode bg-painel text-verde'}`}>
          <Icone nome={picos >= exigidos ? 'check' : 'balancar'} tamanho={52} strokeWidth={picos >= exigidos ? 2.4 : 1.8} />
        </span>
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="font-display text-[44px] leading-none font-bold">{fraco ? 'Mais força!' : titulo}</div>
        <div className="text-[17px] font-semibold text-[#C6D6CD]">{picos < exigidos ? `${picos} de ${exigidos}` : ''}</div>
      </div>
    </div>
  );
}

/**
 * "Segura e balança": segure o botão e balance o celular. Soltar dá 0,8 s de folga.
 * Enquanto segura, a tela vira o anel de progresso (Balancando).
 */
function BotaoBalancar({
  uid,
  alvo,
  al,
  leitura,
  partidaId,
  armado,
  setArmado,
  aoProgresso,
  aoRegistrar,
}: {
  uid: string;
  alvo: Alvo;
  al: Alcance | null;
  leitura: Leitura | null;
  partidaId: string;
  armado: boolean;
  setArmado: (a: boolean) => void;
  aoProgresso: (picos: number, novoPico: boolean) => void;
  aoRegistrar: (chave: string) => void;
}) {
  const conexao = useConexao();
  // Re-renderiza depois do toque de ativação (o estado de ativação do navegador não é reativo).
  const [, setAtivado] = useState(0);
  const soltar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrando = useRef(false);
  const pode = al === 'dentro' && !alvo.conquistado;

  const balancar = async () => {
    if (registrando.current || !pode || !leitura) return;
    registrando.current = true;
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
      feedback.balancou();
      if (conexao !== 'online') setTimeout(() => feedback.guardado(), 450);
      setArmado(false);
      aoRegistrar(item.chave);
      void sync.sincronizar();
    } finally {
      registrando.current = false;
    }
  };

  useBalanco(armado && pode, () => void balancar(), aoProgresso, alvo.ponto.sacudidas);

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
    feedback.armou();
    if (soltar.current) clearTimeout(soltar.current);
    setArmado(true);
  };
  const desarmar = () => {
    if (soltar.current) clearTimeout(soltar.current);
    soltar.current = setTimeout(() => setArmado(false), 800);
  };

  // Um toque (click) antes de segurar: libera som, vibração e, no iPhone, os sensores.
  if (pode && (!permissaoDeMovimento.liberada() || precisaDeToqueParaFeedback()))
    return (
      <button
        type="button"
        data-testid="balancar"
        onClick={() => {
          destravarSom();
          void pedirPermissaoDeMovimento().finally(() => setAtivado((n) => n + 1));
        }}
        className="mb-4 flex h-[72px] shrink-0 flex-col items-center justify-center rounded-[18px] bg-alerta font-display text-xl font-bold text-[#2a1e05]"
      >
        Toque para ativar som e sensores
      </button>
    );

  if (!pode) {
    const texto = alvo.conquistado ? 'Você já balançou aqui' : al === 'gps-impreciso' || !leitura ? 'Esperando o GPS…' : 'Chegue na área para balançar';
    return (
      <button
        type="button"
        disabled
        data-testid="balancar"
        className="mb-4 h-[72px] shrink-0 rounded-[18px] border-2 border-dashed border-apagado font-display text-lg font-semibold text-suave"
      >
        {texto}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="balancar"
      onPointerDown={(e) => {
        // Mantém os eventos no botão mesmo com a tela trocando por baixo do dedo.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ponteiro sintético ou já liberado: segue sem captura */
        }
        armar();
      }}
      onPointerUp={desarmar}
      onPointerCancel={desarmar}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && armar()}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && desarmar()}
      onContextMenu={(e) => e.preventDefault()}
      className={`mb-4 flex shrink-0 touch-none flex-col items-center justify-center rounded-[18px] select-none [-webkit-touch-callout:none] ${
        armado
          ? 'h-[88px] bg-texto text-verde-tinta shadow-[0_0_0_10px_rgba(67,224,138,0.28)]'
          : 'animate-acende h-[72px] bg-verde text-verde-tinta shadow-[0_0_0_6px_rgba(67,224,138,0.2)]'
      }`}
    >
      <span className="font-display text-[23px] font-bold">{armado ? 'Segurando…' : 'Segura e balança!'}</span>
      <span className="text-[13px] font-semibold opacity-85">{armado ? 'solte para cancelar' : 'segure o botão e sacuda'}</span>
    </button>
  );
}
