import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FAIXA_MORNO_M, FAIXA_QUENTE_M, SACUDIDAS_PADRAO } from '@/dominio/constantes';
import type { Alcance, Faixa } from '@/dominio/radar';
import type { PontoLocal } from '@/sync/db';
import { Icone, type NomeIcone } from '@/ui/Icone';
import type { Alvo } from '../alvos';
import type { Leitura } from '../sensores';
import { LinhaDoPonto } from './Pontos';
import { Balancando, Banner, CartaoAlvo, Mostrador } from './Radar';

/*
 * Demonstrações do onboarding: um celular com as telas de verdade do jogo (Banner, Mostrador,
 * CartaoAlvo, Balancando), movidas por uma linha do tempo em vez dos sensores.
 */

/** Aparelho: 180×378, tela 170×368 (= 390×844 do app, com as áreas seguras do iPhone). */
const AP_L = 180;
const AP_A = 378;
const ESCALA_TELA = 170 / 390;

const limitar = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const entre = (t: number, de: number, ate: number) => limitar((t - de) / (ate - de));
const suave = (x: number) => x * x * (3 - 2 * x);
const mistura = (a: number, b: number, x: number) => a + (b - a) * x;

const parado = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fração do ciclo (0–1) que avança em loop; com movimento reduzido, fica parada em `quadroFixo`. */
function useLinhaDoTempo(duracaoMs: number, quadroFixo: number): { t: number; volta: number } {
  const [estado, setEstado] = useState({ t: parado() ? quadroFixo : 0, volta: 0 });
  useEffect(() => {
    if (parado()) return;
    let id = 0;
    let ultimo = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      // ~30 quadros por segundo bastam e poupam bateria.
      if (agora - ultimo > 33) {
        ultimo = agora;
        const total = (agora - inicio) / duracaoMs;
        setEstado({ t: total % 1, volta: Math.floor(total) });
      }
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [duracaoMs]);
  return estado;
}

/** Maior escala (até `maxima`) que cabe no espaço livre da ilustração. */
function useEscalaQueCabe(alturaExtra: number, maxima: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setEscala(Math.max(0.6, Math.min(maxima, el.clientHeight / (AP_A + alturaExtra), el.clientWidth / (AP_L + 8))));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [alturaExtra, maxima]);
  return [ref, escala] as const;
}

const PONTO: PontoLocal = {
  id: 'demo',
  numero: 1,
  nome: 'Ponto 1',
  lat: 0,
  lng: 0,
  raioM: 25,
  valorBase: 100,
  passoPct: 0.1,
  pisoPct: 0.2,
  sacudidas: SACUDIDAS_PADRAO,
  ativo: true,
  desativadoEm: null,
  sincronizadoEm: 0,
};
const LEITURA: Leitura = { lat: 0, lng: 0, accuracy: 0, t: 0 };

const faixaDe = (d: number): Faixa => (d <= FAIXA_QUENTE_M ? 'quente' : d <= FAIXA_MORNO_M ? 'morno' : 'frio');

function alvoDemo(d: number, rumo: number, ponto: Partial<PontoLocal> = {}, pts = 100, tendencia: 'esquentando' | 'esfriando' | 'estavel' = 'esquentando'): Alvo {
  return { ponto: { ...PONTO, ...ponto }, medida: { d, faixa: faixaDe(d), tendencia }, rumo, nivel: 'alto', pts, conquistado: false };
}

/** Um dos três estados do banner, como no jogo (dica 1). */
export function BannerDemo({ d, tendencia }: { d: number; tendencia: 'esquentando' | 'esfriando' | 'estavel' }) {
  return <Banner alvo={alvoDemo(d, 0, {}, 100, tendencia)} leitura={LEITURA} al="fora" mudanca={null} demo />;
}

function Aparelho({ escala, deslocamento, children, dedo }: { escala: number; deslocamento?: CSSProperties; children: ReactNode; dedo?: ReactNode }) {
  return (
    <div className="relative shrink-0" style={{ width: AP_L * escala, height: AP_A * escala }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: AP_L, height: AP_A, transform: `scale(${escala})` }}>
        <div className="relative size-full" style={deslocamento}>
          {['top-[76px] -left-0.5 h-[22px]', 'top-[112px] -left-0.5 h-[42px]', 'top-[162px] -left-0.5 h-[42px]', 'top-[124px] -right-0.5 h-[62px]'].map((pos) => (
            <span key={pos} className={`absolute w-[3px] rounded-sm bg-[#3a433e] ${pos}`} />
          ))}
          <div
            className="relative size-full rounded-[34px] p-[5px] shadow-[0_0_0_1px_#0b1410,inset_0_0_0_1px_rgba(255,255,255,0.12)]"
            style={{ background: 'linear-gradient(145deg, #5b6660, #2a312d 40%, #4a544f)' }}
          >
            <div className="relative size-full overflow-hidden rounded-[29px] bg-noite shadow-[0_0_0_3px_#050807]">
              <span className="absolute top-2.5 left-1/2 z-20 -ml-[29px] h-[17px] w-[58px] rounded-[10px] bg-black" />
              <div className="absolute top-0 left-0 h-[844px] w-[390px] origin-top-left bg-noite text-texto" style={{ transform: `scale(${ESCALA_TELA})` }}>
                {children}
                <span className="absolute bottom-[9px] left-1/2 z-20 -ml-[67px] h-[5px] w-[134px] rounded-full bg-texto/80" />
              </div>
            </div>
          </div>
          {dedo}
        </div>
      </div>
    </div>
  );
}

/** Tela do app dentro do aparelho: áreas seguras do iPhone e a barra de abas presa embaixo. */
function TelaDoApp({ aba, children }: { aba: 'radar' | 'pontos'; children: ReactNode }) {
  return (
    <>
      <div className="flex h-full flex-col gap-4 px-5 pt-[59px] pb-[99px]">
        <header className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-px">
            <div className="text-[13px] text-suave">Ana Lima</div>
            <div className="font-display text-[26px] leading-tight font-bold">0 pts</div>
          </div>
          <span className="flex min-h-11 items-center gap-2 rounded-full border border-borda bg-painel py-0 pr-1.5 pl-3.5 text-sm font-semibold text-[#d3e0d8]">
            <span className="size-2 rounded-full bg-verde" />
            Sincronizado
            <Icone nome="avancar" tamanho={16} />
          </span>
        </header>
        {children}
      </div>
      <BarraDeAbas ativa={aba} />
    </>
  );
}

function BarraDeAbas({ ativa }: { ativa: 'radar' | 'pontos' }) {
  const abas: [string, string, NomeIcone][] = [
    ['radar', 'Radar', 'radar'],
    ['pontos', 'Pontos', 'lista'],
    ['ranking', 'Ranking', 'trofeu'],
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 grid grid-cols-3 border-t border-borda bg-noite pb-[34px]">
      {abas.map(([id, rotulo, icone]) => (
        <span key={id} className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${ativa === id ? 'text-verde' : 'text-suave'}`}>
          <Icone nome={icone} tamanho={22} />
          {rotulo}
        </span>
      ))}
    </div>
  );
}

function BotaoDemo({ estado }: { estado: 'fora' | 'pronto' | 'segurando' }) {
  if (estado === 'fora')
    return <div className="mb-4 flex h-[72px] shrink-0 items-center justify-center rounded-[18px] bg-painel text-base font-semibold text-suave">Chegue na área para balançar</div>;
  const segurando = estado === 'segurando';
  return (
    <div
      className={`mb-4 flex shrink-0 flex-col items-center justify-center rounded-[18px] ${
        segurando ? 'h-[88px] bg-texto text-verde-tinta shadow-[0_0_0_10px_rgba(67,224,138,0.28)]' : 'h-[72px] bg-verde text-verde-tinta shadow-[0_0_0_6px_rgba(67,224,138,0.2)]'
      }`}
    >
      <span className="font-display text-[23px] font-bold">{segurando ? 'Segurando…' : 'Segura e balança!'}</span>
      <span className="text-[13px] font-semibold opacity-85">{segurando ? 'solte para cancelar' : 'segure o botão e balance'}</span>
    </div>
  );
}

/** Dedo de toque: a ponta (≈ 45%, 10% do ícone) fica em (x, y) nas coordenadas do aparelho. */
function Dedo({ x, y, entrada, apertado }: { x: number; y: number; entrada: number; apertado: boolean }) {
  const fora = 1 - suave(entrada);
  return (
    <span
      className="pointer-events-none absolute z-30 text-texto"
      style={{
        left: x - 76 * 0.446,
        top: y - 76 * 0.096,
        opacity: suave(entrada),
        transform: `translate(${fora * 52}px, ${fora * 80}px) rotate(${fora * 8}deg) ${apertado ? 'translateY(6px) scale(0.94)' : ''}`,
      }}
    >
      <Icone nome="toque" tamanho={76} strokeWidth={1.4} />
    </span>
  );
}

/* ---------- Dica 2: escolha um ponto (aba Pontos -> radar do ponto) ---------- */

const LISTA = [alvoDemo(110, 0, { id: '1', numero: 1, nome: 'Ponto 1' }, 60), alvoDemo(320, -60, { id: '2', numero: 2, nome: 'Ponto 2' }, 100, 'estavel'), alvoDemo(380, 120, { id: '3', numero: 3, nome: 'Ponto 3' }, 80, 'esfriando')];

export function DemoEscolha() {
  const { t } = useLinhaDoTempo(6000, 0.6);
  const [ref, escala] = useEscalaQueCabe(0, 1.4);
  const radar = entre(t, 0.34, 0.38) * (1 - entre(t, 0.93, 0.98));
  const entrada = t < 0.34 ? entre(t, 0.06, 0.2) : 1 - entre(t, 0.34, 0.46);
  const apertado = t > 0.24 && t < 0.32;
  // Centro da linha do Ponto 2 (coordenadas do aparelho).
  const yLinha = 5 + (59 + 51 + 16 + 35 + 16 + 50 + 16 + 74 + 8 + 36) * ESCALA_TELA;
  return (
    <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center">
      <Aparelho escala={escala} dedo={<Dedo x={AP_L * 0.55} y={yLinha} entrada={entrada} apertado={apertado} />}>
        <div className="absolute inset-0" style={{ opacity: 1 - radar }}>
          <TelaDoApp aba="pontos">
            <h1 className="m-0 font-display text-[28px] leading-tight font-bold">Pontos</h1>
            <div className="grid grid-cols-2 rounded-[14px] border border-borda bg-painel p-1">
              <span className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-texto text-[15px] font-semibold text-noite">
                <Icone nome="local" tamanho={18} />
                Mais perto
              </span>
              <span className="flex h-10 items-center justify-center gap-1.5 text-[15px] font-semibold text-suave">
                <Icone nome="ordenar" tamanho={18} />
                Vale mais
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {LISTA.map((a, i) => (
                <LinhaDoPonto key={a.ponto.id} alvo={a} naBussola={i === 0} pressionado={i === 1 && apertado} />
              ))}
            </div>
          </TelaDoApp>
        </div>
        <div className="absolute inset-0 bg-noite" style={{ opacity: radar, transform: `translateX(${(1 - radar) * 24}px)` }}>
          <TelaDoApp aba="radar">
            <Banner alvo={LISTA[1]!} leitura={LEITURA} al="fora" mudanca={null} demo />
            <Mostrador alvo={LISTA[1]!} heading={0} al="fora" demo />
            <CartaoAlvo alvo={LISTA[1]!} escolhido trocar={() => {}} voltarAoMaisPerto={() => {}} />
            <div className="grow" />
            <BotaoDemo estado="fora" />
          </TelaDoApp>
        </div>
      </Aparelho>
    </div>
  );
}

/* ---------- Dica 3: chegue até o ponto (vira, anda e o radar esquenta) ---------- */

// Uma linha do tempo só: vira 5–17%, anda 18–77% em ritmo constante (frio 18–36, morno 36–56, quente 56–77).
const VIRA = [0.05, 0.17];
const ANDA = [0.18, 0.77];
const MORNO_EM = 0.36;
const QUENTE_EM = 0.56;

function distancia(t: number) {
  if (t < ANDA[0]!) return 650;
  if (t < MORNO_EM) return mistura(650, FAIXA_MORNO_M, entre(t, ANDA[0]!, MORNO_EM));
  if (t < QUENTE_EM) return mistura(FAIXA_MORNO_M, FAIXA_QUENTE_M, entre(t, MORNO_EM, QUENTE_EM));
  return mistura(FAIXA_QUENTE_M, 17, entre(t, QUENTE_EM, ANDA[1]!)) - 5 * entre(t, ANDA[1]!, 0.82);
}

const TRILHA = 'M 24 74 C 90 74, 110 22, 170 30 S 250 60, 296 34';
const FRACAO = [(MORNO_EM - ANDA[0]!) / (ANDA[1]! - ANDA[0]!), (QUENTE_EM - MORNO_EM) / (ANDA[1]! - ANDA[0]!)] as const;
const TRECHOS: [string, number, number][] = [
  ['#bbd4ff', 0, FRACAO[0] * 100],
  ['#ffd98a', FRACAO[0] * 100, FRACAO[1] * 100],
  ['#ff7a45', (FRACAO[0] + FRACAO[1]) * 100, (1 - FRACAO[0] - FRACAO[1]) * 100],
];
const COR_ALVO: Record<Faixa | 'chegou', string> = { frio: '#bbd4ff', morno: '#ffd98a', quente: '#ff7a45', chegou: '#43e08a' };

export function DemoChegue() {
  const { t, volta } = useLinhaDoTempo(10000, 0.6);
  const [ref, escala] = useEscalaQueCabe(112, 1.25);
  const d = distancia(t);
  // A bola começa atrás e à direita; virar traz ela para a frente da seta (a bússola gira, como no app).
  const giro = mistura(-135, 0, suave(entre(t, VIRA[0]!, VIRA[1]!)));
  const alvo = alvoDemo(d, 0);
  const al: Alcance = d <= 17 ? 'dentro' : 'fora';
  const faixa = alvo.medida!.faixa;
  const etapa = al === 'dentro' ? 3 : ({ frio: 0, morno: 1, quente: 2 } as const)[faixa];
  const visivel = entre(t, 0, 0.03) * (1 - entre(t, 0.95, 1));
  const andou = entre(t, ANDA[0]!, ANDA[1]!);
  const andando = t > ANDA[0]! && t < ANDA[1]!;
  const passo = andando ? Math.sin(andou * Math.PI * 2 * 14) : 0;
  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3" style={{ opacity: visivel }}>
      <Aparelho escala={escala}>
        <TelaDoApp aba="radar">
          <Banner alvo={alvo} leitura={LEITURA} al={al} mudanca={etapa > 0 ? { tipo: 'esquentou', n: etapa + volta * 4 } : null} demo />
          <Mostrador alvo={alvo} heading={giro} al={al} demo />
          <CartaoAlvo alvo={alvo} escolhido={false} trocar={() => {}} voltarAoMaisPerto={() => {}} />
          <div className="grow" />
          <div className="relative flex shrink-0 flex-col">
            {al === 'dentro' && (
              <span key={volta} aria-hidden="true">
                {[0, 0.25, 0.5].map((atraso) => (
                  <span
                    key={atraso}
                    className="efeito-onda-chegou pointer-events-none absolute top-9 left-1/2 -mt-[60px] -ml-[60px] size-[120px] rounded-full border-[3px] border-verde opacity-0"
                    style={{ animationDelay: `${atraso}s` }}
                  />
                ))}
              </span>
            )}
            <BotaoDemo estado={al === 'dentro' ? 'pronto' : 'fora'} />
          </div>
        </TelaDoApp>
        {faixa === 'quente' && al !== 'dentro' && (
          <div className="efeito-borda-quente pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_90px_24px_rgba(255,122,69,0.7)]" />
        )}
      </Aparelho>
      <div className="relative h-24 w-[320px] max-w-full shrink-0">
        <svg viewBox="0 0 320 96" className="size-full">
          <defs>
            {TRECHOS.map(([, ini, comp], i) => (
              <mask key={i} id={`trecho-demo-${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="96">
                <path d={TRILHA} fill="none" stroke="#fff" strokeWidth="12" pathLength={100} strokeDasharray={`0 ${ini} ${comp} 200`} />
              </mask>
            ))}
          </defs>
          {TRECHOS.map(([cor], i) => (
            <path key={i} d={TRILHA} mask={`url(#trecho-demo-${i})`} fill="none" stroke={cor} strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />
          ))}
          <circle cx="296" cy="34" r="18" fill={COR_ALVO[al === 'dentro' ? 'chegou' : faixa]} fillOpacity="0.16" />
          <circle cx="296" cy="34" r="7" fill={COR_ALVO[al === 'dentro' ? 'chegou' : faixa]} />
        </svg>
        {/* A pessoa: começa de costas, vira junto com a bússola e anda pela trilha. */}
        <span
          className="absolute top-0 left-0 text-texto"
          style={{ offsetPath: `path('${TRILHA}')`, offsetRotate: '0deg', offsetAnchor: '50% 92%', offsetDistance: `${andou * 100}%` } as CSSProperties}
        >
          <span className="block" style={{ transform: `scaleX(${t < 0.11 ? -1 : 1})` }}>
            <span className="block origin-bottom" style={{ transform: `translateY(${-Math.max(0, passo) * 3}px) rotate(${passo * 4}deg)` }}>
              <Icone nome="andar" tamanho={34} strokeWidth={1.6} />
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

/* ---------- Dica 4: segure e balance (chegou -> Balançando, balançando de cima para baixo) ---------- */

const PICOS = [0.3, 0.42, 0.54, 0.66];

export function DemoBalanco() {
  const { t } = useLinhaDoTempo(5000, 0.45);
  const [ref, escala] = useEscalaQueCabe(48, 1);
  const segurando = t > 0.18 && t < 0.8;
  const balancando = entre(t, 0.17, 0.2) * (1 - entre(t, 0.92, 0.97));
  const picos = PICOS.filter((p) => t >= p).length;
  // Sobe e desce, com os picos (embaixo) no instante em que cada balanço conta.
  const k = (t - 0.27) / 0.12;
  const y = t > 0.27 && t < 0.69 ? 18 * Math.sin(2 * Math.PI * k) : 0;
  const entrada = t < 0.5 ? entre(t, 0, 0.13) : 1 - entre(t, 0.8, 0.9);
  const chegou = alvoDemo(6, 150);
  return (
    <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center">
      <Aparelho
        escala={escala}
        deslocamento={{ transform: `translateY(${y}px) rotate(${y / 18}deg)`, transformOrigin: '50% 80%' }}
        dedo={<Dedo x={AP_L / 2} y={5 + (844 - 34 - 64 - 16 - 44) * ESCALA_TELA} entrada={entrada} apertado={segurando} />}
      >
        <div className="absolute inset-0" style={{ opacity: 1 - balancando }}>
          <TelaDoApp aba="radar">
            <Banner alvo={chegou} leitura={LEITURA} al="dentro" mudanca={null} demo />
            <Mostrador alvo={chegou} heading={0} al="dentro" demo />
            <CartaoAlvo alvo={chegou} escolhido={false} trocar={() => {}} voltarAoMaisPerto={() => {}} />
            <div className="grow" />
            <BotaoDemo estado="pronto" />
          </TelaDoApp>
        </div>
        <div className="absolute inset-0 bg-noite" style={{ opacity: balancando }}>
          <div className="flex h-full flex-col gap-4 px-5 pt-[59px] pb-[99px]">
            <Balancando picos={picos} exigidos={SACUDIDAS_PADRAO} fraco={false} demo />
            <BotaoDemo estado={segurando ? 'segurando' : 'pronto'} />
          </div>
          <BarraDeAbas ativa="radar" />
        </div>
      </Aparelho>
    </div>
  );
}
