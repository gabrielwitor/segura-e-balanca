import { useEffect, useRef, useState, type RefObject } from 'react';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { hora } from '@/ui/tempo';
import type { DadosDoJogo } from '../dados';
import { useConexao } from '../dados';
import { monitor, sync } from '../servicos';
import { nomeDaPista } from './Radar';

/** Último placar mostrado por jogador: o cabeçalho desmonta na tela de resultado e precisa lembrar. */
const ultimoPlacar = new Map<string, number>();

const reduzMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Pontos subiram: o "+N" voa do meio da tela até o placar, que rola até o valor novo e dá um pulo. */
function usePlacarAnimado(uid: string, pontos: number, placar: RefObject<HTMLElement | null>) {
  const [mostrado, setMostrado] = useState(() => Math.min(ultimoPlacar.get(uid) ?? pontos, pontos));
  const [voo, setVoo] = useState<{ delta: number; x: number; y: number; n: number } | null>(null);
  const [pulo, setPulo] = useState(0);
  useEffect(() => {
    const antes = ultimoPlacar.get(uid);
    ultimoPlacar.set(uid, pontos);
    if (antes == null || pontos <= antes || reduzMovimento()) {
      setMostrado(pontos);
      return;
    }
    const r = placar.current?.getBoundingClientRect();
    setMostrado(antes);
    setVoo({ delta: pontos - antes, n: performance.now(), x: r ? r.left + 40 - innerWidth / 2 : 0, y: r ? r.top + r.height / 2 - innerHeight / 2 : -300 });
    let quadro = 0;
    const chegada = setTimeout(() => {
      setPulo((n) => n + 1);
      const inicio = performance.now();
      const passo = (agora: number) => {
        const p = Math.min(1, (agora - inicio) / 400);
        setMostrado(Math.round(antes + (pontos - antes) * p));
        if (p < 1) quadro = requestAnimationFrame(passo);
      };
      quadro = requestAnimationFrame(passo);
    }, 1000);
    return () => {
      clearTimeout(chegada);
      cancelAnimationFrame(quadro);
      setMostrado(pontos);
    };
  }, [uid, pontos, placar]);
  return { mostrado, voo, pulo, pousou: () => setVoo(null) };
}

/** Topo do jogo: apelido, posição provisória, pontos e o estado de conexão (RF-30). */
export function Cabecalho({ uid, apelido, dados }: { uid: string; apelido: string; dados: DadosDoJogo }) {
  const minha = dados.ranking.ranking.find((l) => l.uid === uid);
  const oficial = dados.partida?.estado === 'finalizada';
  const placar = useRef<HTMLDivElement>(null);
  const { mostrado, voo, pulo, pousou } = usePlacarAnimado(uid, minha?.pontos ?? 0, placar);
  return (
    <header className="flex items-center justify-between gap-3">
      {voo && (
        <span
          key={voo.n}
          onAnimationEnd={pousou}
          className="efeito-voa-pontos pointer-events-none fixed top-1/2 left-1/2 z-50 rounded-full bg-verde px-[18px] py-2.5 font-display text-[30px] font-bold text-verde-tinta shadow-[0_8px_30px_rgba(67,224,138,0.45)]"
          style={{ '--x': `${voo.x}px`, '--y': `${voo.y}px` } as React.CSSProperties}
          aria-hidden="true"
        >
          +{voo.delta}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-px">
        <div className="truncate text-[13px] text-suave">
          {apelido}
          {minha ? ` · ${minha.pos}º ${oficial ? 'final' : 'provisório'}` : ''}
        </div>
        <div
          ref={placar}
          key={pulo}
          className={`font-display text-[26px] leading-tight font-bold tabular-nums ${pulo > 0 ? 'efeito-pulo-placar' : ''}`}
          data-testid="meus-pontos"
        >
          {mostrado} pts
        </div>
      </div>
      <ChipConexao dados={dados} />
    </header>
  );
}

const ESTILO = {
  online: { texto: 'Sincronizado', cls: 'border-borda bg-painel text-[#d3e0d8]', ponto: 'bg-verde', cont: 'bg-verde text-verde-tinta' },
  'sem-rede': { texto: 'Sem rede', cls: 'border-alerta-borda bg-alerta-fundo text-morno-texto', ponto: 'bg-alerta', cont: 'bg-alerta text-[#2a1e05]' },
  'servidor-indisponivel': { texto: 'Servidor fora', cls: 'border-erro-borda bg-erro-fundo text-erro-texto', ponto: 'bg-erro', cont: 'bg-erro text-[#2a0b07]' },
} as const;

/** Chip tocável: abre o painel com o estado da conexão e as pendências. */
export function ChipConexao({ dados }: { dados: DadosDoJogo }) {
  const estado = useConexao();
  const [aberto, setAberto] = useState(false);
  const e = ESTILO[estado];
  const pendentes = dados.pendentes;
  const texto = estado === 'online' && pendentes > 0 ? 'Enviando' : e.texto;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        data-testid="conexao"
        aria-label={`${texto}${pendentes ? `, ${pendentes} ${pendentes === 1 ? 'balançada pendente' : 'balançadas pendentes'}` : ''}. Ver detalhes`}
        className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-0 pr-1.5 pl-3.5 text-sm font-semibold ${e.cls}`}
      >
        <span className={`size-2 rounded-full ${e.ponto}`} />
        {texto}
        {pendentes > 0 && <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[13px] font-bold ${e.cont}`}>{pendentes}</span>}
        <Icone nome="avancar" tamanho={16} />
      </button>
      {aberto && <PainelConexao dados={dados} fechar={() => setAberto(false)} />}
    </>
  );
}

const PAINEL: Record<string, { titulo: string; texto: string; icone: NomeIcone; cor: string }> = {
  online: { titulo: 'Tudo sincronizado', texto: '', icone: 'check', cor: 'bg-[#12301F] text-verde' },
  'sem-rede': { titulo: 'Sem internet', texto: 'Continue jogando. Enviamos quando a internet voltar.', icone: 'semRede', cor: 'bg-morno text-morno-texto' },
  'servidor-indisponivel': { titulo: 'Servidor não responde', texto: 'Continue jogando. Reenviamos sozinhos.', icone: 'servidor', cor: 'bg-erro-fundo text-erro-texto' },
};

function PainelConexao({ dados, fechar }: { dados: DadosDoJogo; fechar: () => void }) {
  const estado = useConexao();
  const p = PAINEL[estado]!;
  const pendentes = dados.saida.filter((i) => i.status !== 'rejeitada');
  const [tentando, setTentando] = useState(false);
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fecharRef.current?.focus();
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && fechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [fechar]);

  const tentarAgora = async () => {
    setTentando(true);
    try {
      if ((await monitor.heartbeat()) === 'online') await sync.aoReconectar();
    } finally {
      setTentando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" tabIndex={-1} aria-label="Fechar" onClick={fechar} className="absolute inset-0 bg-[rgba(5,10,8,0.7)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="con-t"
        className="relative flex w-full max-w-[440px] flex-col gap-4 rounded-t-3xl border-t border-borda bg-painel px-5 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))]"
      >
        <span className="h-[5px] w-10 self-center rounded-full bg-[#3A4A41]" aria-hidden="true" />
        <div className="flex items-center gap-3.5">
          <span className={`flex size-[52px] shrink-0 items-center justify-center rounded-2xl ${p.cor}`}>
            <Icone nome={p.icone} tamanho={26} />
          </span>
          <h2 id="con-t" className="m-0 font-display text-2xl font-bold">
            {p.titulo}
          </h2>
        </div>
        {p.texto && <p className="m-0 text-base text-[#D3E0D8]">{p.texto}</p>}
        {pendentes.length > 0 && (
          <section aria-labelledby="pend-t" className="flex flex-col gap-2">
            <h3 id="pend-t" className="m-0 text-xs font-bold tracking-widest text-suave">
              PENDENTES
            </h3>
            <ul className="m-0 list-none rounded-[14px] border border-borda bg-radar p-0">
              {pendentes.map((i) => {
                const ponto = dados.pontos.find((x) => x.id === i.pontoId);
                return (
                  <li key={i.chave} className="flex min-h-12 items-center justify-between border-b border-borda px-3.5 text-[15px] last:border-0">
                    <span>{ponto ? nomeDaPista(ponto) : 'Pista'}</span>
                    <span className="text-[13px] text-suave">{hora(i.entrada.t)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div className="flex flex-col gap-2.5">
          {estado === 'servidor-indisponivel' && (
            <button type="button" onClick={() => void tentarAgora()} disabled={tentando} className="h-[52px] rounded-2xl bg-texto font-bold text-noite disabled:opacity-60">
              {tentando ? 'Tentando…' : 'Tentar agora'}
            </button>
          )}
          <button ref={fecharRef} type="button" onClick={fechar} className="h-[52px] rounded-2xl border border-borda font-semibold">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
