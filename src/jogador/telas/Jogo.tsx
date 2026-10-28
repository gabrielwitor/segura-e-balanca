import { useEffect, useState } from 'react';
import { Icone } from '@/ui/Icone';
import { useDadosDoJogo, useSessao } from '../dados';
import { Avisos } from './Avisos';
import { ligarEscuta } from '../servicos';
import { Radar } from './Radar';
import { Ranking } from './Ranking';
import { Historico } from './Historico';
import { Tela } from './Tela';
import { PainelDebug } from './PainelDebug';
import { PrimeiraVez } from './PrimeiraVez';
import { Instalar } from './Instalar';
import { dicasVistas } from '../instalacao';

export type Aba = 'radar' | 'ranking' | 'historico' | 'instalar';

export function Jogo({ uid, apelido, abaInicial }: { uid: string; apelido: string; abaInicial: Aba }) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const sessao = useSessao();
  const dados = useDadosDoJogo(uid, sessao?.dispositivoId);

  // Seção 6.3: listeners ligados enquanto estiver no jogo (o SDK reconecta sozinho).
  useEffect(() => ligarEscuta(uid), [uid]);

  const [dicas, setDicas] = useState(() => !dicasVistas.ler());

  if (!dados || !sessao) return <Tela carregando />;

  if (aba === 'instalar') return <Instalar passo={null} aoContinuar={() => setAba('ranking')} />;

  return (
    <Tela className="gap-4 !pb-0">
      {aba === 'radar' && <Radar uid={uid} apelido={apelido} dados={dados} sessao={sessao} irParaRanking={() => setAba('ranking')} />}
      {aba === 'ranking' && (
        <Ranking uid={uid} apelido={apelido} dados={dados} sessao={sessao} abrirHistorico={() => setAba('historico')} abrirInstalar={() => setAba('instalar')} />
      )}
      {aba === 'historico' && <Historico uid={uid} voltar={() => setAba('ranking')} />}
      <PainelDebug dados={dados} />
      <Avisos dados={dados} />
      {dicas && aba === 'radar' && dados.partida?.estado === 'ativa' && (
        <PrimeiraVez
          aoFechar={() => {
            dicasVistas.marcar();
            setDicas(false);
          }}
        />
      )}
      <nav
        aria-label="Navegação"
        className="sticky bottom-0 -mx-5 mt-auto grid grid-cols-2 border-t border-borda bg-noite pb-[env(safe-area-inset-bottom)]"
      >
        {(
          [
            ['radar', 'Radar', 'radar'],
            ['ranking', 'Ranking', 'trofeu'],
          ] as const
        ).map(([id, rotulo, icone]) => {
          const ativa = aba === id || (id === 'ranking' && aba === 'historico');
          return (
            <button
              key={id}
              type="button"
              aria-current={ativa ? 'page' : undefined}
              onClick={() => setAba(id)}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${ativa ? 'text-verde' : 'text-suave'}`}
            >
              <Icone nome={icone} tamanho={22} />
              {rotulo}
            </button>
          );
        })}
      </nav>
    </Tela>
  );
}
