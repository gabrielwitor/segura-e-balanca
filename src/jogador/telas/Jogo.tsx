import { useEffect, useState } from 'react';
import PullToRefresh from 'react-simple-pull-to-refresh';
import { Icone } from '@/ui/Icone';
import { useDadosDoJogo, useSessao } from '../dados';
import { useRadar } from '../alvos';
import { Avisos } from './Avisos';
import { atualizarAgora, ligarEscuta } from '../servicos';
import { Girando } from './Tela';
import { Radar } from './Radar';
import { Ranking } from './Ranking';
import { Pontos } from './Pontos';
import { Historico } from './Historico';
import { Tela } from './Tela';
import { PainelDebug } from './PainelDebug';
import { PrimeiraVez } from './PrimeiraVez';
import { Instalar } from './Instalar';
import { dicasVistas } from '../instalacao';

export type Aba = 'radar' | 'pontos' | 'ranking' | 'historico' | 'instalar';

export function Jogo({ uid, apelido, abaInicial }: { uid: string; apelido: string; abaInicial: Aba }) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const sessao = useSessao();
  const dados = useDadosDoJogo(uid, sessao?.dispositivoId);

  // Seção 6.3: listeners ligados enquanto estiver no jogo (o SDK reconecta sozinho).
  useEffect(() => ligarEscuta(uid), [uid]);

  const [dicas, setDicas] = useState(() => !dicasVistas.ler());
  /** Botão de balançar seguro ou tela de resultado aberta: puxar para atualizar fica desligado. */
  const [ocupado, setOcupado] = useState(false);

  // GPS e bússola ligados no Radar e em Pontos (as duas abas mostram distância e temperatura).
  const radar = useRadar(dados, aba === 'radar' || aba === 'pontos');
  /** Ponto escolhido na aba Pontos; null = a bússola mostra o mais perto. */
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const naBussola = radar.alvos.find((a) => a.ponto.id === alvoId && !a.conquistado)?.ponto.id ?? radar.maisPerto?.ponto.id;

  if (!dados || !sessao) return <Tela carregando />;

  if (aba === 'instalar') return <Instalar passo={null} aoContinuar={() => setAba('ranking')} />;

  return (
    <Tela className="gap-4 !pb-0">
      {/* Puxar para atualizar: sincroniza sem recarregar. Desligado enquanto segura o botão ou vê o resultado. */}
      <PullToRefresh
        onRefresh={() => atualizarAgora(uid)}
        isPullable={!ocupado}
        pullDownThreshold={72}
        maxPullDownDistance={110}
        resistance={2}
        backgroundColor="transparent"
        pullingContent={
          <div className="flex h-14 items-center justify-center text-suave" aria-hidden="true">
            <Icone nome="seta" tamanho={22} className="rotate-180" />
          </div>
        }
        refreshingContent={
          <div role="status" className="flex h-14 items-center justify-center gap-2 text-sm font-semibold text-suave">
            <Girando tamanho={18} />
            Atualizando…
          </div>
        }
      >
        <div className="flex grow flex-col gap-4">
          {aba === 'radar' && (
            <Radar
              uid={uid}
              apelido={apelido}
              dados={dados}
              sessao={sessao}
              irParaRanking={() => setAba('ranking')}
              radar={radar}
              alvoId={alvoId}
              setAlvoId={setAlvoId}
              irParaPontos={() => setAba('pontos')}
              aoOcupar={setOcupado}
            />
          )}
          {aba === 'pontos' && (
            <Pontos
              uid={uid}
              apelido={apelido}
              dados={dados}
              alvos={radar.alvos}
              naBussola={naBussola}
              escolher={(id) => {
                // Escolher o mais perto é o mesmo que não escolher: a bússola segue o mais perto.
                setAlvoId(id === radar.maisPerto?.ponto.id ? null : id);
                setAba('radar');
              }}
            />
          )}
          {aba === 'ranking' && (
            <Ranking uid={uid} apelido={apelido} dados={dados} sessao={sessao} abrirHistorico={() => setAba('historico')} abrirInstalar={() => setAba('instalar')} />
          )}
          {aba === 'historico' && <Historico uid={uid} voltar={() => setAba('ranking')} />}
        </div>
      </PullToRefresh>
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
        className="sticky bottom-0 -mx-5 mt-auto grid grid-cols-3 border-t border-borda bg-noite pb-[env(safe-area-inset-bottom)]"
      >
        {(
          [
            ['radar', 'Radar', 'radar'],
            ['pontos', 'Pontos', 'lista'],
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
