import { useState, useSyncExternalStore } from 'react';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { conviteNativo, plataforma, pulouInstalacao } from '../instalacao';
import { BotaoPrimario, Tela } from './Tela';

type Passo = { texto: React.ReactNode; icone?: NomeIcone };

/** Tela 2 · instalar a PWA: convite nativo no Android, passo a passo no iPhone, sair do navegador de app. */
export function Instalar({ aoContinuar, passo = 'Passo 2 de 3' }: { aoContinuar: () => void; passo?: string | null }) {
  const p = plataforma();
  const temConvite = useSyncExternalStore(conviteNativo.inscrever, conviteNativo.disponivel);
  const [copiado, setCopiado] = useState(false);

  const pular = () => {
    pulouInstalacao.marcar();
    aoContinuar();
  };

  let titulo: string;
  let sub: string;
  let passos: Passo[] = [];
  let acao: React.ReactNode;

  if (p === 'navegador-de-app') {
    titulo = 'Abra no navegador';
    sub = 'Por aqui o radar não funciona.';
    passos = [
      { texto: <>Toque nos <strong>três pontinhos</strong></>, icone: 'mais' },
      { texto: <><strong>Abrir no navegador</strong></> },
    ];
    acao = (
      <BotaoPrimario
        onClick={() => {
          void navigator.clipboard?.writeText(location.origin).then(() => setCopiado(true));
        }}
      >
        <Icone nome="copiar" tamanho={20} />
        {copiado ? 'Link copiado' : 'Copiar o link'}
      </BotaoPrimario>
    );
  } else if (p === 'iphone') {
    titulo = 'Adicione à Tela de Início';
    sub = 'Abre mais rápido e funciona sem internet.';
    passos = [
      { texto: <>Toque em <strong>Compartilhar</strong></>, icone: 'compartilhar' },
      { texto: <><strong>Adicionar à Tela de Início</strong></>, icone: 'adicionar' },
      { texto: <>Toque em <strong>Adicionar</strong></> },
    ];
    acao = <BotaoPrimario onClick={aoContinuar}>Já adicionei</BotaoPrimario>;
  } else {
    titulo = 'Instale o jogo';
    sub = 'Abre mais rápido e funciona sem internet.';
    if (!temConvite)
      passos = [
        { texto: <>Abra o menu <strong>⋮</strong> do Chrome</>, icone: 'mais' },
        { texto: <><strong>Instalar app</strong></>, icone: 'instalar' },
      ];
    acao = temConvite ? (
      <BotaoPrimario onClick={() => void conviteNativo.abrir().then((ok) => ok && aoContinuar())}>
        <Icone nome="instalar" tamanho={20} />
        Instalar o jogo
      </BotaoPrimario>
    ) : (
      <BotaoPrimario onClick={aoContinuar}>Já instalei</BotaoPrimario>
    );
  }

  return (
    <Tela className="gap-6">
      <div className="flex min-h-11 items-center justify-between">
        <span className="text-sm font-semibold text-suave">{passo}</span>
        {p !== 'navegador-de-app' && (
          <button type="button" onClick={pular} className="flex h-11 items-center text-[15px] font-semibold text-suave">
            Agora não
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        <img src="/icone.svg" alt="" width={72} height={72} className="shrink-0 rounded-[18px] border border-borda" />
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-[28px] leading-tight font-bold">{titulo}</h1>
          <p className="m-0 text-[15px] text-[#C6D6CD]">{sub}</p>
        </div>
      </div>
      {passos.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {passos.map((x, i) => (
            <li key={i} className="flex items-center gap-3.5 rounded-2xl border border-borda bg-painel px-3.5 py-3">
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-texto font-bold text-noite">{i + 1}</span>
              <span className="grow text-[15px] leading-snug">{x.texto}</span>
              {x.icone && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#1A2B23] text-[#7EB6FF]">
                  <Icone nome={x.icone} tamanho={22} />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="grow" />
      {acao}
    </Tela>
  );
}
