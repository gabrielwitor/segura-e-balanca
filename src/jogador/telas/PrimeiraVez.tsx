import { useEffect, useRef, useState } from 'react';
import { Icone, type NomeIcone } from '@/ui/Icone';

const DICAS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  { icone: 'termometro', titulo: 'Siga a temperatura', texto: 'Frio, morno ou quente: vá esquentando.' },
  { icone: 'radar', titulo: 'Escolha uma pista', texto: 'Toque numa pista. As claras valem mais.' },
  { icone: 'balancar', titulo: 'Segure e sacuda', texto: 'Na área, segure o botão e sacuda 3 vezes.' },
];

/** Tela 5 · três dicas na primeira vez no radar. */
export function PrimeiraVez({ aoFechar }: { aoFechar: () => void }) {
  const [n, setN] = useState(0);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => botao.current?.focus(), [n]);
  const d = DICAS[n]!;
  const ultima = n === DICAS.length - 1;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(5,10,8,0.82)] px-5 pt-[18vh]">
      <div role="dialog" aria-modal="true" aria-labelledby="dica-t" className="flex w-full max-w-sm flex-col gap-4 rounded-[22px] bg-texto p-5 text-noite shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-[#33463C]">
            Dica {n + 1} de {DICAS.length}
          </span>
          <button type="button" onClick={aoFechar} className="flex h-11 items-center text-sm font-semibold text-[#33463C]">
            Pular dicas
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span className={`flex size-16 shrink-0 items-center justify-center rounded-[18px] bg-noite text-verde ${ultima ? 'animate-sacode' : ''}`}>
            <Icone nome={d.icone} tamanho={34} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 id="dica-t" className="m-0 font-display text-[22px] leading-tight font-bold">
              {d.titulo}
            </h2>
            <p className="m-0 text-[15px] leading-snug text-[#22312A]">{d.texto}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden="true">
            {DICAS.map((_, i) => (
              <span key={i} className={`h-2 rounded-full transition-[width] ${i === n ? 'w-[22px] bg-noite' : 'w-2 bg-[#9DB0A6]'}`} />
            ))}
          </div>
          <button ref={botao} type="button" onClick={() => (ultima ? aoFechar() : setN(n + 1))} className="h-12 rounded-[14px] bg-noite px-5 font-bold text-texto">
            {ultima ? 'Vamos lá' : 'Próxima'}
          </button>
        </div>
      </div>
    </div>
  );
}
