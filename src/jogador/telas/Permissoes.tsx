import { useState } from 'react';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { destravarSom } from '../feedback';
import { pedirLocalizacao, pedirPermissaoDeMovimento } from '../sensores';
import { BotaoPrimario, Girando, Tela } from './Tela';

type Estado = 'antes' | 'pedindo' | 'ok' | 'negado';

const SENSORES: { id: 'local' | 'movimento' | 'bussola'; icone: NomeIcone; nome: string; para: string }[] = [
  { id: 'local', icone: 'local', nome: 'Localização', para: 'Distância até as pistas' },
  { id: 'movimento', icone: 'balancar', nome: 'Movimento', para: 'Detectar a sacudida' },
  { id: 'bussola', icone: 'bussola', nome: 'Orientação', para: 'Girar o radar' },
];

/** Tela 3 · explica os sensores antes do pedido do sistema (RF-05: um toque pede tudo). */
export function Permissoes({ aoContinuar, aoNegarLocalizacao, passo = 'Passo 3 de 3' }: { aoContinuar: () => void; aoNegarLocalizacao: () => void; passo?: string | null }) {
  const [estado, setEstado] = useState<Record<string, Estado>>({ local: 'antes', movimento: 'antes', bussola: 'antes' });
  const pedindo = Object.values(estado).includes('pedindo');

  const pedir = async () => {
    destravarSom();
    // Movimento primeiro: o iOS só aceita o pedido com o gesto ainda "quente".
    setEstado({ local: 'antes', movimento: 'pedindo', bussola: 'pedindo' });
    const mov = await pedirPermissaoDeMovimento();
    setEstado({ local: 'pedindo', movimento: mov ? 'ok' : 'negado', bussola: mov ? 'ok' : 'negado' });
    const loc = await pedirLocalizacao();
    setEstado({ local: loc === 'negada' ? 'negado' : 'ok', movimento: mov ? 'ok' : 'negado', bussola: mov ? 'ok' : 'negado' });
    if (loc === 'negada') aoNegarLocalizacao();
    else aoContinuar();
  };

  return (
    <Tela className="gap-6">
      {passo && <div className="text-sm font-semibold text-suave">{passo}</div>}
      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 font-display text-[32px] leading-tight font-bold">O jogo precisa de 3 sensores</h1>
        <p className="m-0 text-base text-[#C6D6CD]">
          Toque em <strong className="text-texto">Permitir</strong> em cada pedido.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {SENSORES.map((s) => {
          const e = estado[s.id];
          return (
            <li key={s.id} className={`flex items-center gap-3.5 rounded-2xl border bg-painel px-4 py-3.5 ${e === 'pedindo' ? 'border-alerta-borda' : 'border-borda'}`}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#1A2B23] text-verde">
                <Icone nome={s.icone} tamanho={22} />
              </span>
              <span className="flex grow flex-col">
                <strong className="text-[15px]">{s.nome}</strong>
                <span className="text-sm text-suave">{s.para}</span>
              </span>
              <span className="shrink-0 text-[13px] font-bold" role="status">
                {e === 'ok' && <span className="text-verde-claro">Permitido</span>}
                {e === 'negado' && <span className="text-[#FFB4AD]">Negado</span>}
                {e === 'pedindo' && <Girando tamanho={16} />}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grow" />
      <BotaoPrimario onClick={() => void pedir()} disabled={pedindo}>
        {pedindo ? 'Aguardando sua resposta…' : 'Permitir e continuar'}
      </BotaoPrimario>
    </Tela>
  );
}
