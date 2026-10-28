import { useState } from 'react';
import { Icone } from '@/ui/Icone';
import type { DadosDoJogo } from '../dados';
import { nomeDoPonto, type Alvo } from '../alvos';
import { Cabecalho } from './Cabecalho';
import { ANIM_FAIXA, COR_FAIXA, ICONE_FAIXA, SETA_TENDENCIA, valorDoPonto } from './Radar';

type Ordem = 'perto' | 'valor';

const ORDENS: [Ordem, string, 'local' | 'ordenar'][] = [
  ['perto', 'Mais perto', 'local'],
  ['valor', 'Vale mais', 'ordenar'],
];

const COR_TEXTO_FAIXA = { frio: 'text-frio-texto', morno: 'text-morno-texto', quente: 'text-quente' } as const;

/** Aba Pontos: todos os pontos, por proximidade ou por quanto valem agora. Tocar põe o ponto na bússola. */
export function Pontos({
  uid,
  apelido,
  dados,
  alvos,
  naBussola,
  escolher,
}: {
  uid: string;
  apelido: string;
  dados: DadosDoJogo;
  alvos: Alvo[];
  /** Ponto que está na bússola agora. */
  naBussola: string | undefined;
  escolher: (id: string) => void;
}) {
  const [ordem, setOrdem] = useState<Ordem>('perto');
  const dist = (a: Alvo) => a.medida?.d ?? Infinity;
  const abertos = alvos
    .filter((a) => !a.conquistado)
    .sort((a, b) => (ordem === 'perto' ? dist(a) - dist(b) : b.pts - a.pts || dist(a) - dist(b)) || a.ponto.numero - b.ponto.numero);
  const feitos = alvos.filter((a) => a.conquistado);

  return (
    <>
      <Cabecalho uid={uid} apelido={apelido} dados={dados} />
      <h1 className="m-0 font-display text-[28px] leading-tight font-bold">Pontos</h1>
      <div role="group" aria-label="Ordenar" className="grid grid-cols-2 rounded-[14px] border border-borda bg-painel p-1">
        {ORDENS.map(([id, rotulo, icone]) => (
          <button
            key={id}
            type="button"
            aria-pressed={ordem === id}
            onClick={() => setOrdem(id)}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-[15px] font-semibold ${ordem === id ? 'bg-texto text-noite' : 'text-suave'}`}
          >
            <Icone nome={icone} tamanho={18} />
            {rotulo}
          </button>
        ))}
      </div>
      {alvos.length === 0 ? (
        <p className="m-0 text-suave">Nenhum ponto no momento</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Pontos" data-testid="lista-pontos">
          {abertos.map((a) => {
            const m = a.medida;
            const alvo = a.ponto.id === naBussola;
            return (
              <li key={a.ponto.id}>
                <button
                  type="button"
                  onClick={() => escolher(a.ponto.id)}
                  aria-current={alvo ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl border bg-painel px-3.5 py-3 text-left ${alvo ? 'border-2 border-texto' : 'border-borda'}`}
                >
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${m ? COR_FAIXA[m.faixa] : 'bg-apagado text-texto'}`}>
                    <Icone nome={m ? ICONE_FAIXA[m.faixa] : 'local'} tamanho={22} className={m ? ANIM_FAIXA[m.faixa] : undefined} />
                  </span>
                  <span className="flex grow flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-[17px] font-bold">{nomeDoPonto(a.ponto)}</span>
                      {alvo && (
                        <span className="flex h-6 items-center gap-1 rounded-full bg-texto px-2 text-xs font-bold text-noite">
                          <Icone nome="radar" tamanho={13} strokeWidth={2} />
                          Alvo
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] text-suave">{valorDoPonto(a)}</span>
                  </span>
                  {m && (
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className={`text-sm font-bold ${COR_TEXTO_FAIXA[m.faixa]}`}>{m.faixa}</span>
                      <span className="text-xs font-semibold text-suave">{SETA_TENDENCIA[m.tendencia]}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {feitos.map((a) => (
            <li key={a.ponto.id} className="flex items-center gap-3 rounded-2xl border border-borda px-3.5 py-3 opacity-60">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-apagado text-texto">
                <Icone nome="check" tamanho={20} strokeWidth={2.4} />
              </span>
              <span className="flex flex-col">
                <span className="text-[17px] font-bold">{nomeDoPonto(a.ponto)}</span>
                <span className="text-[13px] text-suave">conquistado</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
