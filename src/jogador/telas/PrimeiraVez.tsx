import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SACUDIDAS_PADRAO } from '@/dominio/constantes';
import { Icone } from '@/ui/Icone';
import { destravarSom, feedback } from '../feedback';
import { permissaoDeMovimento, pedirPermissaoDeMovimento, useBalanco } from '../sensores';
import { Balancando } from './Radar';

/** Três dicas e o treino: a bolinha do treino é a 4ª do indicador. */
const PASSOS = 4;

/** Segurando sem nenhuma leitura do acelerômetro por esse tempo: aparelho sem sensor (ou bloqueado). */
const LIMITE_SEM_SENSOR_MS = 2500;

/** Folga para soltar o dedo sem perder o progresso (igual ao botão do jogo). */
const FOLGA_SOLTAR_MS = 800;

/** Tela 5 · primeira vez no radar: três dicas em tela cheia e um treino de balançar. */
export function PrimeiraVez({ aoFechar }: { aoFechar: () => void }) {
  const [n, setN] = useState(0);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-noite text-texto">
      {n < 3 ? (
        <Dica n={n} aoPular={aoFechar} aoAvancar={() => setN(n + 1)} />
      ) : (
        <Treino aoTerminar={aoFechar} />
      )}
    </div>
  );
}

function Moldura({ children, passo, pular }: { children: ReactNode; passo?: number; pular?: { rotulo: string; acao: () => void } }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-6 px-5 pt-[max(20px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <header className="flex h-11 shrink-0 items-center justify-between">
        {passo != null && (
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: PASSOS }, (_, i) => (
              <span key={i} className={`h-2 rounded-full transition-[width] ${i === passo ? 'w-[22px] bg-texto' : 'w-2 bg-apagado'}`} />
            ))}
          </div>
        )}
        {pular && (
          <button type="button" onClick={pular.acao} className="h-11 px-1 text-[15px] font-semibold text-suave">
            {pular.rotulo}
          </button>
        )}
      </header>
      {children}
    </div>
  );
}

const DICAS: { titulo: string; texto: string; ilustracao: () => ReactNode }[] = [
  { titulo: 'Siga a temperatura', texto: 'Frio, morno ou quente: vá esquentando.', ilustracao: Termometros },
  { titulo: 'Escolha uma pista', texto: 'Toque numa pista. As claras valem mais.', ilustracao: Pistas },
  { titulo: 'Segure e balance', texto: `Na área, segure o botão e balance ${SACUDIDAS_PADRAO} vezes.`, ilustracao: BotaoDeExemplo },
];

function Dica({ n, aoPular, aoAvancar }: { n: number; aoPular: () => void; aoAvancar: () => void }) {
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => botao.current?.focus(), [n]);
  const d = DICAS[n]!;
  const ultima = n === DICAS.length - 1;
  return (
    <Moldura passo={n} pular={{ rotulo: 'Pular', acao: aoPular }}>
      <section role="dialog" aria-modal="true" aria-labelledby="dica-t" aria-describedby="dica-d" className="flex grow flex-col gap-6">
        <div className="flex grow flex-col justify-center gap-3 px-1" aria-hidden="true">
          <d.ilustracao />
        </div>
        <div className="flex flex-col gap-2.5">
          <h1 id="dica-t" className="m-0 font-display text-[34px] leading-tight font-bold">
            {d.titulo}
          </h1>
          <p id="dica-d" className="m-0 text-lg text-[#C6D6CD]">
            {d.texto}
          </p>
        </div>
        <button
          ref={botao}
          type="button"
          onClick={aoAvancar}
          className="mt-3 h-14 shrink-0 rounded-2xl bg-verde font-display text-lg font-bold text-verde-tinta"
        >
          {ultima ? 'Experimentar' : 'Próxima'}
        </button>
      </section>
    </Moldura>
  );
}

function Barras({ nivel, cor }: { nivel: number; cor: string }) {
  return (
    <div className="flex h-10 items-end gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-2 rounded-[3px] ${i <= nivel ? cor : 'bg-white/15'}`} style={{ height: 12 + i * 5 }} />
      ))}
    </div>
  );
}

function Termometros() {
  return (
    <>
      {(
        [
          ['Frio', 1, 'bg-frio text-frio-texto opacity-55', 'bg-frio-texto'],
          ['Morno', 3, 'bg-morno text-morno-texto opacity-80', 'bg-morno-texto'],
          ['Quente', 5, 'bg-quente text-quente-tinta', 'bg-quente-tinta'],
        ] as const
      ).map(([nome, nivel, cls, barra]) => (
        <div key={nome} className={`flex items-center gap-4 rounded-[18px] px-4 py-3.5 ${cls}`}>
          <div className="grow font-display text-[28px] leading-none font-bold">{nome}</div>
          <Barras nivel={nivel} cor={barra} />
        </div>
      ))}
    </>
  );
}

function Pistas() {
  return (
    <>
      {(
        [
          ['Pista 1', 'vale alto', 'morno', 'bg-morno text-morno-texto', true],
          ['Pista 2', 'vale médio', 'frio', 'bg-frio text-frio-texto', false],
        ] as const
      ).map(([nome, valor, faixa, cor, escolhida]) => (
        <div
          key={nome}
          className={`flex items-center gap-3 rounded-[18px] border-2 px-4 py-3.5 ${escolhida ? 'border-texto bg-painel' : 'border-borda'}`}
        >
          <span className={`m-[3px] size-[18px] rounded-full shadow-[0_0_0_5px_rgba(244,247,245,0.18)] ${escolhida ? 'bg-[#F4F7F5]' : 'bg-fraco'}`} />
          <span className="flex grow flex-col">
            <span className="text-[17px] font-bold">{nome}</span>
            <span className="text-[13px] text-suave">{valor}</span>
          </span>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${cor}`}>{faixa}</span>
        </div>
      ))}
    </>
  );
}

function BotaoDeExemplo() {
  return (
    <>
      <div className="flex justify-center">
        <div className="flex size-[200px] items-center justify-center">
          <span className="flex size-24 animate-sacode items-center justify-center rounded-[28px] bg-painel text-verde">
            <Icone nome="balancar" tamanho={52} />
          </span>
        </div>
      </div>
      <div className="mt-3 flex h-[72px] flex-col items-center justify-center rounded-[18px] bg-verde text-verde-tinta shadow-[0_0_0_6px_rgba(67,224,138,0.2)]">
        <span className="font-display text-[23px] font-bold">Segura e balança!</span>
        <span className="text-[13px] font-semibold opacity-85">segure o botão e balance</span>
      </div>
    </>
  );
}

type Fase = 'pronto' | 'soltou' | 'pegou' | 'sem-sensor';

/** Treino de balançar: mesmo botão, anel, sons e vibração do jogo, sem registrar nada. */
function Treino({ aoTerminar }: { aoTerminar: () => void }) {
  const exigidos = SACUDIDAS_PADRAO;
  // No iPhone, sem a permissão de movimento não há o que treinar: pede primeiro.
  const [fase, setFase] = useState<Fase>(() => (permissaoDeMovimento.liberada() ? 'pronto' : 'sem-sensor'));
  const [armado, setArmado] = useState(false);
  const [picos, setPicos] = useState(0);
  const picosRef = useRef(0);
  const [fraco, setFraco] = useState(false);
  const soltar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const concluido = useRef(false);
  const comecar = useRef<HTMLButtonElement>(null);

  const zerar = () => {
    picosRef.current = 0;
    setPicos(0);
    setFraco(false);
  };

  useBalanco(
    armado,
    () => {
      concluido.current = true;
      if (soltar.current) clearTimeout(soltar.current);
      feedback.balancou();
      setArmado(false);
      zerar();
      setFase('pegou');
    },
    (n, novo) => {
      // Picos expiraram sem completar: balanço fraco ou devagar demais.
      if (!novo && n === 0 && picosRef.current > 0) {
        setFraco(true);
        feedback.balancoFraco();
      }
      if (novo) {
        setFraco(false);
        if (n < exigidos) feedback.pico(n, exigidos);
      }
      picosRef.current = n;
      setPicos(n);
    },
    exigidos,
  );

  // Segurando e o acelerômetro não manda nada: aparelho sem sensor de movimento.
  useEffect(() => {
    if (!armado) return;
    let chegou = false;
    const f = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity?.x != null) chegou = true;
    };
    window.addEventListener('devicemotion', f);
    const id = setTimeout(() => {
      if (chegou) return;
      setArmado(false);
      zerar();
      setFase('sem-sensor');
    }, LIMITE_SEM_SENSOR_MS);
    return () => {
      clearTimeout(id);
      window.removeEventListener('devicemotion', f);
    };
  }, [armado]);

  useEffect(() => () => void (soltar.current && clearTimeout(soltar.current)), []);
  useEffect(() => {
    if (fase === 'pegou') comecar.current?.focus();
  }, [fase]);

  const armar = () => {
    destravarSom();
    feedback.armou();
    if (soltar.current) clearTimeout(soltar.current);
    concluido.current = false;
    setFase('pronto');
    setArmado(true);
  };
  const desarmar = () => {
    if (soltar.current) clearTimeout(soltar.current);
    soltar.current = setTimeout(() => {
      if (concluido.current) return;
      setArmado(false);
      zerar();
      setFase('soltou');
    }, FOLGA_SOLTAR_MS);
  };

  if (fase === 'pegou')
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="treino-ok" className="flex min-h-full flex-col items-center gap-6 bg-verde px-6 pt-7 pb-[max(28px,env(safe-area-inset-bottom))] text-verde-tinta">
        <div className="grow" />
        <span className="flex size-[132px] items-center justify-center rounded-full bg-verde-tinta text-verde">
          <Icone nome="check" tamanho={68} strokeWidth={2.4} />
        </span>
        <div className="flex flex-col items-center gap-2.5 text-center">
          <h1 id="treino-ok" className="m-0 font-display text-[46px] leading-none font-bold tracking-tight">
            Pegou o jeito!
          </h1>
          <p className="m-0 text-[17px] font-medium">No jogo, isso vale pontos.</p>
        </div>
        <div className="grow" />
        <div className="flex w-full max-w-[400px] flex-col gap-1">
          <button ref={comecar} type="button" onClick={aoTerminar} className="h-14 rounded-2xl bg-verde-tinta font-display text-lg font-bold text-texto">
            Começar a jogar
          </button>
          <button type="button" onClick={() => setFase('pronto')} className="h-11 text-[15px] font-semibold">
            Treinar de novo
          </button>
        </div>
      </div>
    );

  if (fase === 'sem-sensor')
    return (
      <Moldura passo={3}>
        <div className="flex grow flex-col items-center justify-center gap-5 text-center" role="alert">
          <span className="flex size-24 items-center justify-center rounded-[28px] bg-[#3A2410] text-[#FFB08A]">
            <Icone nome="balancar" tamanho={52} />
          </span>
          <h1 className="m-0 font-display text-[32px] leading-tight font-bold">Sem sensor de movimento</h1>
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              destravarSom();
              void pedirPermissaoDeMovimento().then((ok) => ok && setFase('pronto'));
            }}
            className="h-14 rounded-2xl bg-verde font-display text-lg font-bold text-verde-tinta"
          >
            Ativar sensores
          </button>
          <button type="button" onClick={aoTerminar} className="h-12 text-[15px] font-semibold text-suave">
            Pular treino
          </button>
        </div>
      </Moldura>
    );

  return (
    <Moldura passo={3} pular={{ rotulo: 'Pular treino', acao: aoTerminar }}>
      <div data-testid="treino" className="flex grow flex-col">
        {armado ? (
          <Balancando picos={picos} exigidos={exigidos} fraco={fraco} />
        ) : fase === 'soltou' ? (
          <Balancando picos={0} exigidos={exigidos} fraco={false} titulo="Soltou cedo" legenda="Segure até o fim" alerta />
        ) : (
          <Balancando picos={0} exigidos={exigidos} fraco={false} titulo="Sua vez" legenda={`Segure o botão e balance ${exigidos} vezes`} />
        )}
      </div>
      <button
        type="button"
        data-testid="treinar"
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
        className={`flex shrink-0 touch-none flex-col items-center justify-center rounded-[18px] select-none [-webkit-touch-callout:none] ${
          armado
            ? 'h-[88px] bg-texto text-verde-tinta shadow-[0_0_0_10px_rgba(67,224,138,0.28)]'
            : 'h-[72px] bg-verde text-verde-tinta shadow-[0_0_0_6px_rgba(67,224,138,0.2)]'
        }`}
      >
        <span className="font-display text-[23px] font-bold">{armado ? 'Segurando…' : 'Segura e balança!'}</span>
        <span className="text-[13px] font-semibold opacity-85">{armado ? 'solte para cancelar' : 'segure o botão e balance'}</span>
      </button>
    </Moldura>
  );
}
