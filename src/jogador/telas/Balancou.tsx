import { useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from '@/ui/Icone';
import { hora } from '@/ui/tempo';
import type { DadosDoJogo } from '../dados';
import { feedback } from '../feedback';
import { nomeDaPista } from './Radar';

const reduzMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Conta de 0 até `alvo` em ~700 ms (o "+100" subindo). */
function useContagem(alvo: number | null): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (alvo == null) return;
    if (reduzMovimento()) {
      setN(alvo);
      return;
    }
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / 700);
      setN(Math.round(alvo * (1 - (1 - p) ** 3)));
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);
  return n;
}

function Confete() {
  const pecas = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        dx: `${Math.round((Math.random() - 0.5) * 340)}px`,
        dy: `${Math.round(-120 - Math.random() * 280)}px`,
        giro: `${Math.round((Math.random() - 0.5) * 720)}deg`,
        cor: ['#FFC24B', '#FFD98A', '#062012', '#F4F7F5', '#F5B301', '#FF7A45'][i % 6],
        atraso: `${Math.round(Math.random() * 120)}ms`,
        largo: i % 3 === 0,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute top-[34%] left-1/2" aria-hidden="true">
      {pecas.map((p, i) => (
        <span
          key={i}
          className="animate-confete absolute block"
          style={
            {
              '--dx': p.dx,
              '--dy': p.dy,
              '--giro': p.giro,
              animationDelay: p.atraso,
              width: p.largo ? 12 : 7,
              height: p.largo ? 6 : 12,
              background: p.cor,
              borderRadius: 2,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Tela 9 · resultado da balançada (RF-23, RF-33). */
export function Balancou({ chave, dados, voltar, irParaRanking }: { chave: string; dados: DadosDoJogo; voltar: () => void; irParaRanking: () => void }) {
  const minha = dados.minhas.find((m) => m.chave === chave);
  const ponto = dados.pontos.find((p) => p.id === minha?.pontoId);
  const entrada = minha ? dados.filas[minha.pontoId]?.entradas[chave] : undefined;
  const s = minha?.situacao ?? { tipo: 'pendente' as const };
  const ok = s.tipo === 'valida' || s.tipo === 'pendente';

  const pts = useContagem(s.tipo === 'valida' ? s.pts : null);

  // Som do desfecho, uma vez: o arpejo do "balançou" já tocou no gesto.
  const tocado = useRef<string | null>(null);
  const tipo = s.tipo;
  const primeiro = s.tipo === 'valida' && s.pos === 1;
  useEffect(() => {
    if (tipo === 'pendente' || tocado.current === tipo) return;
    tocado.current = tipo;
    if (tipo !== 'valida') feedback.naoContou();
    else if (primeiro) setTimeout(() => feedback.primeiroLugar(), 350);
  }, [tipo, primeiro]);

  const recebida = entrada?.recebidoEm;
  let titulo: string;
  let sub: string;
  let terceiro: { texto: string; quando: string; feito: boolean };
  switch (s.tipo) {
    case 'valida':
      titulo = `${s.pos}º lugar · +${pts}`;
      sub = ponto ? nomeDaPista(ponto) : '';
      terceiro = { texto: `${s.pos}º lugar`, quando: '', feito: true };
      break;
    case 'pendente':
      titulo = 'Balançou!';
      sub = 'Vale do mesmo jeito. Enviamos quando a internet voltar.';
      terceiro = { texto: 'Posição', quando: '', feito: false };
      break;
    case 'conflito': {
      const vencedora = minha && dados.filas[minha.pontoId]?.entradas[s.vencedora];
      titulo = 'Já valeu antes';
      sub = 'Seu outro celular balançou antes.';
      terceiro = { texto: 'Outro celular', quando: vencedora ? hora(vencedora.t) : '', feito: true };
      break;
    }
    case 'pausa':
      titulo = 'Não contou';
      sub = 'O jogo estava pausado.';
      terceiro = { texto: 'Pausa', quando: '', feito: true };
      break;
    case 'desativado':
      titulo = 'Não contou';
      sub = 'A pista tinha sido desativada.';
      terceiro = { texto: 'Pista desativada', quando: '', feito: true };
      break;
    case 'rejeitada':
      titulo = 'Não contou';
      sub = 'A partida já tinha acabado.';
      terceiro = { texto: 'Partida encerrada', quando: '', feito: true };
      break;
    case 'anulada':
      titulo = 'Anulada';
      sub = 'Você pode balançar esta pista de novo.';
      terceiro = { texto: 'Anulada', quando: '', feito: true };
      break;
  }
  const passos = [
    { texto: 'Registrada', quando: minha ? hora(minha.t) : '', feito: true },
    { texto: 'Enviada', quando: recebida ? hora(recebida) : '', feito: !!recebida || (s.tipo !== 'pendente' && s.tipo !== 'valida') },
    terceiro,
  ];

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center gap-6 overflow-hidden px-6 pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] ${ok ? 'bg-verde text-verde-tinta' : 'bg-[#1e2622] text-texto'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="balancou-titulo"
      data-testid="balancou"
    >
      {s.tipo === 'valida' && s.pos === 1 && <Confete />}
      <div className="relative mt-6 flex size-[168px] items-center justify-center">
        {ok && <span className="animate-onda absolute inset-0 rounded-full border-4 border-verde-tinta" aria-hidden="true" />}
        {primeiro ? (
          // 1º lugar: o troféu cai quicando.
          <span className="efeito-cai-trofeu flex size-[132px] items-center justify-center rounded-full bg-verde-tinta text-alerta">
            <Icone nome="trofeu" tamanho={68} strokeWidth={2} />
          </span>
        ) : (
          <span className={`flex size-[132px] items-center justify-center rounded-full ${ok ? 'bg-verde-tinta text-verde' : 'bg-apagado text-texto'}`}>
            <Icone nome={ok ? 'check' : 'anular'} tamanho={68} strokeWidth={ok ? 2.4 : 2} />
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-2.5 text-center">
        <h1 id="balancou-titulo" className={`m-0 font-display text-[46px] leading-none font-bold tracking-tight tabular-nums ${primeiro ? 'efeito-surge-titulo' : ''}`}>
          {titulo}
        </h1>
        {sub && <p className="m-0 max-w-xs text-[17px] leading-snug font-medium">{sub}</p>}
      </div>

      <ol aria-label="Andamento" className={`m-0 flex w-full max-w-sm list-none flex-col gap-2.5 rounded-[18px] px-4 py-3.5 ${ok ? 'bg-verde-tinta/10' : 'bg-[#26302B]'}`}>
        {passos.map((p) => (
          <li key={p.texto} className={`flex items-center gap-3 text-[15px] font-semibold ${p.feito ? '' : 'opacity-60'}`}>
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-current ${p.feito ? (ok ? 'bg-verde-tinta text-verde' : 'bg-texto text-[#1e2622]') : ''}`}>
              {p.feito && <Icone nome="check" tamanho={13} strokeWidth={3} />}
            </span>
            <span className="grow">{p.texto}</span>
            <span className="text-[13px] font-medium tabular-nums">{p.quando}</span>
          </li>
        ))}
      </ol>

      <div className="grow" />
      <div className="flex w-full max-w-sm flex-col gap-2.5">
        <button
          type="button"
          onClick={voltar}
          className={`h-14 rounded-2xl font-display text-lg font-bold ${ok ? 'bg-verde-tinta text-verde' : 'bg-texto text-noite'}`}
        >
          {ok ? 'Próxima pista' : 'Voltar ao radar'}
        </button>
        <button
          type="button"
          onClick={() => {
            voltar();
            irParaRanking();
          }}
          className={`h-12 rounded-2xl border-2 text-base font-semibold ${ok ? 'border-verde-tinta/35' : 'border-[#3A4A41]'}`}
        >
          Ver ranking
        </button>
      </div>
    </div>
  );
}
