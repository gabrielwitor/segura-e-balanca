import { useState } from 'react';
import { Icone } from '@/ui/Icone';
import { plataforma } from '../instalacao';
import { BotaoPrimario, Tela } from './Tela';

const GUIAS = {
  iphone: [
    <>Abra <strong>Ajustes › Privacidade › Serviços de Localização</strong>.</>,
    <>Toque em <strong>Safari</strong>.</>,
    <>Escolha <strong>Durante o Uso</strong>.</>,
  ],
  android: [
    <>Toque no <strong>cadeado</strong> do endereço.</>,
    <>Abra <strong>Permissões › Localização</strong>.</>,
    <>Escolha <strong>Permitir</strong>.</>,
  ],
};

/** Tela 14 · localização negada, com o caminho de cada sistema. */
export function PermissaoNegada({ aoTentar, aoVerRanking }: { aoTentar: () => void; aoVerRanking: () => void }) {
  const [so, setSo] = useState<'iphone' | 'android'>(plataforma() === 'iphone' ? 'iphone' : 'android');
  return (
    <Tela className="gap-5">
      <span className="mt-6 flex size-16 items-center justify-center rounded-[18px] bg-erro-fundo text-erro">
        <Icone nome="localNegado" tamanho={32} />
      </span>
      <h1 className="m-0 font-display text-[30px] leading-tight font-bold">Falta liberar a localização</h1>
      <div role="group" aria-label="Seu celular" className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-painel p-1">
        {(['iphone', 'android'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={so === id}
            onClick={() => setSo(id)}
            className={`h-11 rounded-[10px] text-[15px] font-bold ${so === id ? 'bg-texto text-noite' : 'text-suave'}`}
          >
            {id === 'iphone' ? 'iPhone' : 'Android'}
          </button>
        ))}
      </div>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {GUIAS[so].map((passo, i) => (
          <li key={i} className="flex items-start gap-3.5 rounded-2xl border border-borda bg-painel p-3.5 text-[15px] leading-snug">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-texto text-sm font-bold text-noite">{i + 1}</span>
            <span>{passo}</span>
          </li>
        ))}
      </ol>
      <div className="grow" />
      <div className="flex flex-col gap-2.5">
        <BotaoPrimario onClick={aoTentar}>Já liberei, tentar de novo</BotaoPrimario>
        <button type="button" onClick={aoVerRanking} className="h-12 text-[15px] font-semibold text-verde">
          Ver só o ranking
        </button>
      </div>
    </Tela>
  );
}
