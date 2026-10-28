import { useState } from 'react';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { destravarSom } from '../feedback';
import { comLimite, pedirLocalizacao, pedirPermissaoDeMovimento } from '../sensores';
import { BotaoPrimario, Girando, Tela } from './Tela';

type Estado = 'antes' | 'pedindo' | 'ok' | 'negado' | 'sem-resposta';

const LIMITE_MOVIMENTO_MS = 15_000;
const LIMITE_LOCALIZACAO_MS = 20_000;

const SENSORES: { id: 'local' | 'movimento' | 'bussola'; icone: NomeIcone; nome: string; para: string }[] = [
  { id: 'local', icone: 'local', nome: 'Localização', para: 'Distância até os pontos' },
  { id: 'movimento', icone: 'balancar', nome: 'Movimento', para: 'Detectar o balanço' },
  { id: 'bussola', icone: 'bussola', nome: 'Orientação', para: 'Girar o radar' },
];

/** Tela 3 · explica os sensores antes do pedido do sistema (RF-05: um toque pede tudo). */
export function Permissoes({ aoContinuar, aoNegarLocalizacao, passo = 'Passo 3 de 3' }: { aoContinuar: () => void; aoNegarLocalizacao: () => void; passo?: string | null }) {
  const [estado, setEstado] = useState<Record<string, Estado>>({ local: 'antes', movimento: 'antes', bussola: 'antes' });
  const [tentativas, setTentativas] = useState(0);
  const pedindo = Object.values(estado).includes('pedindo');

  const pedir = async () => {
    destravarSom();
    setTentativas((n) => n + 1);
    // Movimento primeiro: o iOS só aceita o pedido com o gesto ainda "quente".
    setEstado({ local: 'antes', movimento: 'pedindo', bussola: 'pedindo' });
    const mov = await comLimite(pedirPermissaoDeMovimento(), LIMITE_MOVIMENTO_MS, null);
    const em: Estado = mov == null ? 'sem-resposta' : mov ? 'ok' : 'negado';
    setEstado({ local: 'pedindo', movimento: em, bussola: em });
    const loc = await comLimite(pedirLocalizacao(), LIMITE_LOCALIZACAO_MS, 'sem-resposta' as const);
    setEstado({ local: loc === 'negada' ? 'negado' : loc === 'sem-resposta' ? 'sem-resposta' : 'ok', movimento: em, bussola: em });
    if (loc === 'negada') aoNegarLocalizacao();
    // Sem resposta da localização: fica aqui com "Tentar de novo" e "Continuar sem permitir".
    else if (loc !== 'sem-resposta') aoContinuar();
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
                {e === 'sem-resposta' && <span className="text-morno-texto">Sem resposta</span>}
                {e === 'pedindo' && <Girando tamanho={16} />}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grow" />
      <div className="flex flex-col gap-1">
        <BotaoPrimario onClick={() => void pedir()} disabled={pedindo}>
          {pedindo ? 'Aguardando sua resposta…' : tentativas > 0 ? 'Tentar de novo' : 'Permitir e continuar'}
        </BotaoPrimario>
        {/* Nunca prende a pessoa aqui: o radar pede a localização de novo e tem "Ativar sensores". */}
        {tentativas > 0 && !pedindo && (
          <button type="button" onClick={aoContinuar} className="h-12 text-[15px] font-semibold text-suave">
            Continuar sem permitir
          </button>
        )}
      </div>
    </Tela>
  );
}
