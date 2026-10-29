import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FAIXA_MORNO_M, FAIXA_QUENTE_M } from '@/dominio/constantes';
import { alcance, type Alcance, type Faixa, type Tendencia } from '@/dominio/radar';
import { registrarBalancada } from '@/sync/saida';
import { Icone } from '@/ui/Icone';
import { useConexao, type DadosDoJogo, type Sessao } from '../dados';
import { nomeDoPonto, type Alvo, type Radar as DadosDoRadar } from '../alvos';
import { db, relogio, sync } from '../servicos';
import { pedirLocalizacao, pedirPermissaoDeMovimento, permissaoDeMovimento, useBalanco, type Leitura } from '../sensores';
import { destravarSom, feedback, precisaDeToqueParaFeedback } from '../feedback';
import { Cabecalho } from './Cabecalho';
import { EstadoVazio } from './EstadoVazio';
import { Balancou } from './Balancou';
import { PermissaoNegada } from './PermissaoNegada';
import { Sobreposicao } from './Tela';

/** Evento do painel de debug para testar sem acelerômetro (desktop, E2E). */
export const EVENTO_SIMULAR_BALANCO = 'seb:simular-balanco';

/** Intervalo do bipe do radar no quente (ms). */
const TICK_QUENTE_MS = 600;

const ORDEM_FAIXA: Record<Faixa, number> = { frio: 0, morno: 1, quente: 2 };

const TEXTO_TENDENCIA: Record<Tendencia, string> = { esquentando: 'Esquentando', esfriando: 'Esfriando', estavel: 'Parado' };

/** "vale 90 pts" (RF-13 revisto: o número exato, pela fila que este aparelho conhece). */
export const valorDoPonto = (a: Alvo) => (a.conquistado ? 'conquistado' : `vale ${a.pts} pts`);

interface Props {
  uid: string;
  apelido: string;
  dados: DadosDoJogo;
  sessao: Sessao;
  irParaRanking: () => void;
  /** Sensores e medidas (compartilhados com a aba Pontos). */
  radar: DadosDoRadar;
  /** Ponto escolhido na aba Pontos; null = o mais perto. */
  alvoId: string | null;
  setAlvoId: (id: string | null) => void;
  irParaPontos: () => void;
  /** Avisa quando está balançando ou mostrando o resultado (o pai desliga o puxar para atualizar). */
  aoOcupar?: (ocupado: boolean) => void;
}

export function Radar({ uid, apelido, dados, sessao, irParaRanking, radar, alvoId, setAlvoId, irParaPontos, aoOcupar }: Props) {
  const partida = dados.partida;
  const { gps, heading, leitura, alvos, maisPerto, jogavel } = radar;
  const ativos = alvos.length;

  const escolhido = alvos.find((a) => a.ponto.id === alvoId && !a.conquistado);
  const alvo = escolhido ?? maisPerto;
  const al: Alcance | null = alvo?.medida && leitura ? alcance(alvo.medida.d, leitura.accuracy, alvo.ponto.raioM) : null;

  const transicoes = useFeedbackDoRadar(alvo, al, jogavel);
  const faixaAtual = alvo && !alvo.conquistado && leitura ? alvo.medida?.faixa : undefined;

  const movimentoLiberado = useSyncExternalStore(permissaoDeMovimento.inscrever, permissaoDeMovimento.liberada);
  const [guiaLocalizacao, setGuiaLocalizacao] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [armado, setArmado] = useState(false);
  const [picos, setPicos] = useState(0);
  const picosRef = useRef(0);
  const [fraco, setFraco] = useState(false);
  useEffect(() => aoOcupar?.(armado || resultado != null), [armado, resultado, aoOcupar]);

  if (!partida || partida.estado !== 'ativa' || ativos === 0)
    return (
      <>
        <Cabecalho uid={uid} apelido={apelido} dados={dados} />
        <EstadoVazio
          partida={partida}
          semPontos={ativos === 0}
          ultimoPull={sessao.ultimoPull}
          minhaPosicao={dados.ranking.ranking.find((l) => l.uid === uid)}
          irParaRanking={irParaRanking}
        />
      </>
    );

  if (guiaLocalizacao)
    return (
      <Sobreposicao>
        <div className="fixed inset-0 z-50 overflow-auto bg-noite">
          <PermissaoNegada aoTentar={() => void pedirLocalizacao().then((r) => r !== 'negada' && setGuiaLocalizacao(false))} aoVerRanking={irParaRanking} />
        </div>
      </Sobreposicao>
    );

  if (resultado)
    return (
      <Sobreposicao>
        <Balancou
          chave={resultado}
          dados={dados}
          voltar={() => {
            setResultado(null);
            setAlvoId(null); // volta para o ponto aberto mais perto
          }}
          irParaRanking={irParaRanking}
        />
      </Sobreposicao>
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
            alvo && <Banner alvo={alvo} leitura={leitura} al={al} mudanca={transicoes.mudanca} />
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
          {alvo && (
            <>
              <Mostrador alvo={alvo} heading={heading} leitura={leitura} al={al} />
              <CartaoAlvo alvo={alvo} escolhido={!!escolhido} trocar={irParaPontos} voltarAoMaisPerto={() => setAlvoId(null)} />
            </>
          )}
        </>
      )}
      <div className="grow" />
      {/* Quente (fora da área): as bordas da tela pulsam no ritmo do bipe. */}
      {!armado && faixaAtual === 'quente' && al !== 'dentro' && (
        <Sobreposicao>
          <div className="efeito-borda-quente pointer-events-none fixed inset-0 z-40 shadow-[inset_0_0_90px_24px_rgba(255,122,69,0.7)]" aria-hidden="true" />
        </Sobreposicao>
      )}
      {!armado && transicoes.mudanca?.tipo === 'esfriou' && faixaAtual === 'frio' && (
        <Sobreposicao>
          <Esfriou key={transicoes.mudanca.n} />
        </Sobreposicao>
      )}
      {alvo && (
        <div className="relative flex shrink-0 flex-col">
          {/* Chegou na área: três ondas verdes saem do botão. */}
          {transicoes.chegou > 0 && al === 'dentro' && !armado && (
            <span key={transicoes.chegou} aria-hidden="true">
              {[0, 0.25, 0.5].map((atraso) => (
                <span
                  key={atraso}
                  className="efeito-onda-chegou pointer-events-none absolute top-9 left-1/2 -mt-[60px] -ml-[60px] size-[120px] rounded-full border-[3px] border-verde opacity-0"
                  style={{ animationDelay: `${atraso}s` }}
                />
              ))}
            </span>
          )}
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
        </div>
      )}
    </>
  );
}

/** Sons e vibração do radar: mudança de faixa, chegada na área e bipe no quente. */
/** Última mudança de faixa (para o banner virar) e quantas vezes chegou na área (ondas no botão). */
export interface Transicoes {
  mudanca: { tipo: 'esquentou' | 'esfriou'; n: number } | null;
  chegou: number;
}

function useFeedbackDoRadar(alvo: Alvo | undefined, al: Alcance | null, jogavel: boolean): Transicoes {
  const faixa = alvo && !alvo.conquistado ? alvo.medida?.faixa : undefined;
  const alvoId = alvo?.ponto.id;
  const anterior = useRef<{ id?: string; faixa?: Faixa; dentro: boolean }>({ dentro: false });
  const [transicoes, setTransicoes] = useState<Transicoes>({ mudanca: null, chegou: 0 });

  useEffect(() => {
    const a = anterior.current;
    const dentro = al === 'dentro';
    // Trocar de ponto não conta como esquentar/esfriar.
    if (a.id === alvoId && faixa && a.faixa && faixa !== a.faixa) {
      const tipo = ORDEM_FAIXA[faixa] > ORDEM_FAIXA[a.faixa] ? 'esquentou' : 'esfriou';
      if (tipo === 'esquentou') feedback.esquentou();
      else feedback.esfriou();
      setTransicoes((t) => ({ ...t, mudanca: { tipo, n: (t.mudanca?.n ?? 0) + 1 } }));
    }
    if (a.id === alvoId && dentro && !a.dentro) {
      feedback.entrouNaArea();
      setTransicoes((t) => ({ ...t, chegou: t.chegou + 1 }));
    }
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

  return transicoes;
}

const NIVEL_TERMOMETRO: Record<string, number> = { frio: 1, morno: 3, quente: 4, chegou: 5 };

/** Cor do texto (e das barras) de cada estado: a única cor do banner. */
const TOM = {
  frio: { texto: 'text-frio-texto', barra: 'bg-frio-texto' },
  morno: { texto: 'text-morno-texto', barra: 'bg-morno-texto' },
  quente: { texto: 'text-quente', barra: 'bg-quente' },
  chegou: { texto: 'text-verde', barra: 'bg-verde' },
  neutro: { texto: 'text-texto', barra: 'bg-suave' },
};

const ANIM_ICONE = { fogo: 'efeito-chama', termometro: 'efeito-respira', neve: 'efeito-gira', check: undefined };

function Banner({ alvo, leitura, al, mudanca }: { alvo: Alvo; leitura: Leitura | null; al: Alcance | null; mudanca: Transicoes['mudanca'] }) {
  const m = alvo.medida;
  let v: { titulo: string; sub: string; tom: keyof typeof TOM; nivel: number; icone: 'fogo' | 'termometro' | 'neve' | 'check' | null };
  if (alvo.conquistado) v = { titulo: 'Conquistado', sub: 'Escolha outro ponto', tom: 'neutro', nivel: 0, icone: 'check' };
  else if (!m || !leitura) v = { titulo: 'Procurando você…', sub: 'Aguardando o GPS', tom: 'neutro', nivel: 0, icone: null };
  else if (al === 'dentro') v = { titulo: 'Você chegou!', sub: 'Pode balançar', tom: 'chegou', nivel: NIVEL_TERMOMETRO.chegou!, icone: 'check' };
  else if (al === 'gps-impreciso') v = { titulo: 'Quase lá', sub: 'GPS fraco · vá para céu aberto', tom: 'quente', nivel: NIVEL_TERMOMETRO.quente!, icone: 'fogo' };
  else if (m.faixa === 'quente') v = { titulo: 'Quente!', sub: 'Bem perto', tom: 'quente', nivel: NIVEL_TERMOMETRO.quente!, icone: 'fogo' };
  else if (m.faixa === 'morno') v = { titulo: 'Morno', sub: TEXTO_TENDENCIA[m.tendencia], tom: 'morno', nivel: NIVEL_TERMOMETRO.morno!, icone: 'termometro' };
  else v = { titulo: 'Frio', sub: TEXTO_TENDENCIA[m.tendencia], tom: 'frio', nivel: NIVEL_TERMOMETRO.frio!, icone: 'neve' };
  const tom = TOM[v.tom];

  return (
    <div
      // Remonta a cada mudança de faixa: o banner vira e o ícone novo entra com um pulo.
      key={mudanca?.n ?? 0}
      className={`flex items-center gap-3.5 rounded-[18px] border border-borda bg-painel px-4 py-3.5 ${mudanca ? 'efeito-vira' : ''}`}
      role="status"
      aria-live="polite"
      data-testid="temperatura"
    >
      {v.icone && (
        <span className={`flex shrink-0 ${tom.texto} ${mudanca ? 'efeito-entra-icone' : ''}`} aria-hidden="true">
          <Icone nome={v.icone} tamanho={28} className={ANIM_ICONE[v.icone]} />
        </span>
      )}
      <div className="flex grow flex-col gap-0.5">
        <div className={`font-display text-[26px] leading-7 font-bold ${tom.texto}`}>{v.titulo}</div>
        <div className="text-sm font-semibold text-suave">{v.sub}</div>
      </div>
      <div className="flex items-end gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`w-1.5 rounded-[2px] ${i <= v.nivel ? tom.barra : 'bg-borda'}`} style={{ height: 10 + i * 4 }} />
        ))}
      </div>
    </div>
  );
}

/** Fogo tremula e solta faíscas, termômetro balança, floco gira. */
export function IconeDeFaixa({ icone, entrando }: { icone: 'fogo' | 'termometro' | 'neve'; entrando: boolean }) {
  const caixa = { fogo: 'efeito-brasa', termometro: '', neve: 'efeito-brilho-frio' }[icone];
  const anim = { fogo: 'efeito-chama', termometro: 'efeito-respira', neve: 'efeito-gira' }[icone];
  return (
    <span className={`relative flex size-[52px] shrink-0 items-center justify-center rounded-[14px] bg-white/12 ${caixa}`} aria-hidden="true">
      <span className={`flex ${entrando ? 'efeito-entra-icone' : ''}`}>
        <Icone nome={icone} tamanho={32} className={anim} />
      </span>
      {icone === 'fogo' && <Faiscas />}
    </span>
  );
}

const FAISCAS = [
  { x: 12, dx: -10, dy: -52, atraso: 0 },
  { x: 24, dx: 6, dy: -64, atraso: 0.3 },
  { x: 34, dx: 12, dy: -48, atraso: 0.7 },
  { x: 18, dx: -4, dy: -70, atraso: 1 },
  { x: 40, dx: 14, dy: -58, atraso: 1.3 },
];

function Faiscas() {
  return (
    <>
      {FAISCAS.map((f, i) => (
        <span
          key={i}
          className="efeito-faisca pointer-events-none absolute top-3 block size-1.5 rounded-full bg-morno-texto opacity-0"
          style={{ left: f.x, '--dx': `${f.dx}px`, '--dy': `${f.dy}px`, animationDelay: `${f.atraso}s` } as React.CSSProperties}
        />
      ))}
    </>
  );
}

/** Esfriou: neve cai pela tela e as bordas embaçam por um instante. */
function Esfriou() {
  const flocos = useMemo(
    () =>
      Array.from({ length: 12 }, () => ({
        x: Math.round(Math.random() * 100),
        dx: `${Math.round((Math.random() - 0.5) * 80)}px`,
        dy: `${Math.round(500 + Math.random() * 400)}px`,
        giro: `${Math.round(90 + Math.random() * 270)}deg`,
        atraso: `${(Math.random() * 1.2).toFixed(2)}s`,
        tam: [12, 14, 18][Math.floor(Math.random() * 3)]!,
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      <div className="efeito-gelo absolute inset-0 opacity-0 shadow-[inset_0_0_70px_16px_rgba(187,212,255,0.5)]" />
      {flocos.map((f, i) => (
        <span
          key={i}
          className="efeito-floco absolute -top-5 text-frio-texto opacity-0"
          style={{ left: `${f.x}%`, '--dx': f.dx, '--dy': f.dy, '--giro': f.giro, animationDelay: f.atraso } as React.CSSProperties}
        >
          <Icone nome="neve" tamanho={f.tam} strokeWidth={2} />
        </span>
      ))}
    </div>
  );
}

const C = 150;
/** Raio útil do mostrador (a borda tem as marcas de grau). */
const R_UTIL = 136;

/** Distância real -> raio no mostrador: quente até 44, morno até 100, frio até a borda (400 m+). */
function raioNoMostrador(d: number): number {
  if (d <= FAIXA_QUENTE_M) return 14 + (d / FAIXA_QUENTE_M) * 30;
  if (d <= FAIXA_MORNO_M) return 44 + ((d - FAIXA_QUENTE_M) / (FAIXA_MORNO_M - FAIXA_QUENTE_M)) * 56;
  return Math.min(R_UTIL, 100 + ((d - FAIXA_MORNO_M) / 250) * 36);
}

const noCirculo = (graus: number, r: number) => {
  const a = (graus * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
};

const COR_BLIP: Record<Faixa, string> = { frio: '#bbd4ff', morno: '#ffd98a', quente: '#ff7a45' };
const COR_CHEGOU = '#43e08a';

/**
 * Bússola com um ponto só: direção exata (graus, não setor) e distância real no mostrador.
 * No quente, zoom: o mostrador inteiro vira os últimos 50 m, com a área do ponto e a precisão do GPS.
 * Sem bússola, o mostrador fica com o norte para cima.
 */
function Mostrador({ alvo, heading, leitura, al }: { alvo: Alvo; heading: number | null; leitura: Leitura | null; al: Alcance | null }) {
  const giro = heading ?? 0;
  const m = alvo.medida;
  const zoom = m?.faixa === 'quente' && !alvo.conquistado;
  const escala = R_UTIL / FAIXA_QUENTE_M;
  const temPonto = !!m && alvo.rumo != null;
  const rel = (alvo.rumo ?? 0) - giro;
  const r = m ? (zoom ? Math.min(m.d * escala, R_UTIL) : raioNoMostrador(m.d)) : 0;
  const [x, y] = noCirculo(rel, r);
  const cor = alvo.conquistado ? '#6b8578' : al === 'dentro' ? COR_CHEGOU : COR_BLIP[m?.faixa ?? 'frio'];
  const ponta = (d: number, rr: number) =>
    noCirculo(rel + d, rr)
      .map((n) => n.toFixed(1))
      .join(' ');
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px] shrink-0" data-testid="bussola">
      <svg viewBox="0 0 300 300" className="size-full" role="img" aria-label={`${nomeDoPonto(alvo.ponto)}${m ? `, ${m.faixa}` : ''}`}>
        <defs>
          <clipPath id="mostrador">
            <circle cx={C} cy={C} r="145" />
          </clipPath>
        </defs>
        <circle cx={C} cy={C} r="146" className="fill-radar stroke-borda" strokeWidth="1.5" />
        {Array.from({ length: 12 }, (_, i) => {
          const [x1, y1] = noCirculo(i * 30 - giro, 146);
          const [x2, y2] = noCirculo(i * 30 - giro, 138);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-apagado" strokeWidth="1.5" />;
        })}
        {(['N', 'L', 'S', 'O'] as const).map((letra, i) => {
          const [lx, ly] = noCirculo(i * 90 - giro, 122);
          return (
            <text key={letra} x={lx} y={ly + 5} textAnchor="middle" fontSize="13" fontWeight="700" className={letra === 'N' ? 'fill-texto' : 'fill-fraco'}>
              {letra}
            </text>
          );
        })}
        {temPonto && zoom && leitura && <circle cx={C} cy={C} r={Math.min(leitura.accuracy * escala, R_UTIL)} fill="rgba(232,242,236,.06)" />}
        {temPonto && zoom && <circle cx={x} cy={y} r={alvo.ponto.raioM * escala} clipPath="url(#mostrador)" fill={cor} fillOpacity="0.16" />}
        {temPonto && (
          <>
            {/* Marcador na borda: a direção exata, legível de relance. */}
            <path d={`M${ponta(0, 145)} L${ponta(-3.5, 131)} L${ponta(3.5, 131)} Z`} fill={cor} />
            <circle cx={x} cy={y} r="8" fill={cor} />
          </>
        )}
        {heading != null ? <path d="M150 139 L158 160 L150 155.5 L142 160 Z" className="fill-texto" /> : <circle cx={C} cy={C} r="6" className="fill-texto" />}
      </svg>
    </div>
  );
}

/** Ponto na bússola: nome e valor. */
function CartaoAlvo({ alvo, escolhido, trocar, voltarAoMaisPerto }: { alvo: Alvo; escolhido: boolean; trocar: () => void; voltarAoMaisPerto: () => void }) {
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-borda bg-painel px-3.5 py-3" aria-label="Ponto na bússola">
      <div className="flex grow flex-col">
        <h2 className="m-0 text-[17px] font-bold">{nomeDoPonto(alvo.ponto)}</h2>
        <span className="text-[13px] text-suave">{valorDoPonto(alvo)}</span>
      </div>
      {escolhido ? (
        <button type="button" onClick={voltarAoMaisPerto} className="min-h-11 shrink-0 px-1 text-right text-sm leading-tight font-semibold text-suave">
          Voltar ao
          <br />
          mais perto
        </button>
      ) : (
        <button type="button" onClick={trocar} className="flex min-h-11 shrink-0 items-center gap-1 px-1 text-sm font-semibold text-suave">
          Trocar
          <Icone nome="avancar" tamanho={16} />
        </button>
      )}
    </section>
  );
}

export const COR_FAIXA: Record<Faixa, string> = {
  frio: 'bg-frio text-frio-texto',
  morno: 'bg-morno text-morno-texto',
  quente: 'bg-quente text-quente-tinta',
};

export const ICONE_FAIXA = { frio: 'neve', morno: 'termometro', quente: 'fogo' } as const satisfies Record<Faixa, string>;
export const ANIM_FAIXA: Record<Faixa, string> = { frio: 'efeito-gira', morno: 'efeito-respira', quente: 'efeito-chama' };

export const SETA_TENDENCIA: Record<Tendencia, string> = { esquentando: '↑ esquentando', esfriando: '↓ esfriando', estavel: '= parado' };

/** Até este número de sacudidas o anel é dividido em fatias; acima, vira um anel contínuo. */
const FATIAS_MAX = 12;

/**
 * Tela "Balançando": o anel enche a cada sacudida que conta. O treino do onboarding reaproveita,
 * trocando título e legenda enquanto não está segurando (`alerta` pinta o ícone de amarelo).
 */
export function Balancando({
  picos,
  exigidos,
  fraco,
  titulo: tituloFixo,
  legenda,
  alerta,
}: {
  picos: number;
  exigidos: number;
  fraco: boolean;
  titulo?: string;
  legenda?: string;
  alerta?: boolean;
}) {
  const titulo = tituloFixo ?? (picos >= exigidos ? 'Balançou!' : picos === 0 ? 'Balance!' : picos === exigidos - 1 ? 'Mais uma!' : 'Isso! De novo');
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
  // Cada balanço que conta remonta o conteúdo: a tela treme (mais forte a cada um), a fatia estoura e o ícone achata.
  const amp = Math.min(3 + picos * 2.5, 12);
  return (
    <div
      key={picos}
      className={`flex grow flex-col items-center justify-center gap-6 ${picos > 0 ? 'efeito-tremor' : ''}`}
      style={{ '--amp': `${amp}px`, '--rot': `${(amp / 6).toFixed(1)}deg` } as React.CSSProperties}
      role="status"
      aria-live="assertive"
      data-testid="balancando"
    >
      {picos >= exigidos && (
        <Sobreposicao>
          <div className="efeito-clarao pointer-events-none fixed inset-0 z-40 bg-verde" aria-hidden="true" />
        </Sobreposicao>
      )}
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
                className={`transition-[stroke] duration-150 ${i < picos ? 'stroke-verde' : 'stroke-[#1F3329]'} ${i === picos - 1 ? 'efeito-estoura' : ''}`}
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
        <span
          className={`absolute inset-0 m-auto flex size-24 items-center justify-center rounded-[28px] ${
            picos >= exigidos ? 'bg-verde text-verde-tinta' : alerta ? 'bg-morno text-morno-texto' : 'bg-painel text-verde'
          } ${picos > 0 ? 'efeito-achata' : ''}`}
        >
          <span className={`flex ${picos > 0 || alerta ? '' : 'animate-sacode'}`}>
            <Icone nome={picos >= exigidos ? 'check' : 'balancar'} tamanho={52} strokeWidth={picos >= exigidos ? 2.4 : 1.8} />
          </span>
        </span>
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="font-display text-[44px] leading-none font-bold">{fraco ? 'Mais força!' : titulo}</div>
        <div className="text-[17px] font-semibold text-[#C6D6CD]">{legenda ?? (picos < exigidos ? `${picos} de ${exigidos}` : '')}</div>
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
        className="mb-4 h-[72px] shrink-0 rounded-[18px] bg-painel text-base font-semibold text-suave"
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
      <span className="text-[13px] font-semibold opacity-85">{armado ? 'solte para cancelar' : 'segure o botão e balance'}</span>
    </button>
  );
}
