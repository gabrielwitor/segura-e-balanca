import { useLiveQuery } from 'dexie-react-hooks';
import { Icone } from '@/ui/Icone';
import { haQuanto } from '@/ui/tempo';
import { useAgora, useConexao, type DadosDoJogo, type MinhaBalancada, type Sessao } from '../dados';
import { db } from '../servicos';
import { nomeDaPista } from './Radar';
import { Cabecalho } from './Cabecalho';
import { Girando } from './Tela';
import { AjustesFeedback } from './AjustesFeedback';
import { estaInstalado } from '../instalacao';

interface Linha {
  uid: string;
  apelido: string;
  pontos: number;
  pos: number;
}

/** Tela 4 · Ranking (RF-42, RF-43, RF-44) e tela 9 · carregando / vazio. */
export function Ranking({
  uid,
  apelido,
  dados,
  sessao,
  abrirHistorico,
  abrirInstalar,
}: {
  uid: string;
  apelido: string;
  dados: DadosDoJogo;
  sessao: Sessao;
  abrirHistorico: () => void;
  abrirInstalar: () => void;
}) {
  const conexao = useConexao();
  const agora = useAgora(15_000);
  const historico = useLiveQuery(() => db.historico.count(), []) ?? 0;
  const final = dados.partida?.estado === 'finalizada' ? dados.partida.rankingFinal : null;

  // RF-44: depois de finalizar, vale o ranking congelado; antes, o calculado localmente.
  const linhas: Linha[] = final
    ? final
    : dados.ranking.ranking.map((l) => ({ ...l, apelido: l.uid === uid ? apelido : (dados.apelidos.get(l.uid) ?? 'Jogador') }));

  const carregando = !sessao.ultimoPull && linhas.length === 0;

  return (
    <>
      <Cabecalho uid={uid} apelido={apelido} dados={dados} />
      <div className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-3xl font-bold">Ranking</h1>
        {final ? (
          <p className="m-0 flex items-center gap-2 text-sm font-semibold text-verde">
            <Icone nome="bandeira" tamanho={16} />
            Oficial · jogo finalizado{dados.partida?.finalizadaEm ? ` às ${new Date(dados.partida.finalizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        ) : (
          <>
            <p className="m-0 text-sm font-semibold text-morno-texto" data-testid="ranking-frescor">
              {conexao === 'online'
                ? 'Provisório · ao vivo'
                : `Provisório · offline, atualizado há ${sessao.ultimoPull ? haQuanto(agora - sessao.ultimoPull) : '—'}`}
            </p>
            <p className="m-0 text-sm text-suave">Quem balançou sem internet ainda pode mudar as posições até o fim do jogo.</p>
          </>
        )}
      </div>

      {carregando ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Buscando o ranking mais recente">
          <p className="m-0 flex items-center gap-2 text-suave">
            <Girando tamanho={16} /> Buscando o ranking mais recente…
          </p>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-painel" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-painel text-suave">
            <Icone nome="trofeu" tamanho={30} />
          </span>
          <h2 className="m-0 font-display text-2xl font-bold">Ninguém pontuou ainda</h2>
          <p className="m-0 max-w-xs text-suave">O primeiro a balançar em qualquer ponto leva o valor cheio. Pode ser você.</p>
        </div>
      ) : (
        <>
          <Podio linhas={linhas.slice(0, 3)} uid={uid} />
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="ranking-lista">
            {linhas.slice(3).map((l) => (
              <LinhaRanking key={l.uid} l={l} eu={l.uid === uid} />
            ))}
          </ol>
        </>
      )}

      <MinhasBalancadas minhas={dados.minhas} dados={dados} />

      <button type="button" onClick={abrirHistorico} className="flex h-12 items-center justify-between rounded-2xl border border-borda px-4 text-left">
        <span>Partidas anteriores</span>
        <span className="flex items-center gap-1 text-sm text-suave">
          {historico}
          <Icone nome="avancar" tamanho={16} />
        </span>
      </button>
      {!estaInstalado() && (
        <button type="button" onClick={abrirInstalar} className="flex h-12 items-center justify-between rounded-2xl border border-borda px-4 text-left">
          <span>Instalar o app</span>
          <Icone nome="avancar" tamanho={16} className="text-suave" />
        </button>
      )}
      <div className="mb-4">
        <AjustesFeedback />
      </div>
    </>
  );
}

function Podio({ linhas, uid }: { linhas: Linha[]; uid: string }) {
  const ordem = [linhas[1], linhas[0], linhas[2]];
  const alturas = ['h-20', 'h-28', 'h-14'];
  return (
    <ol className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0" aria-label="Pódio">
      {ordem.map((l, i) =>
        l ? (
          <li key={l.uid} className="flex flex-col items-center gap-1 text-center">
            <span className="w-full truncate text-sm font-semibold">{l.apelido}</span>
            <span className="text-xs text-suave">{l.pontos} pts</span>
            <span
              className={`flex w-full items-start justify-center rounded-t-xl pt-2 font-display text-2xl font-bold ${alturas[i]} ${l.uid === uid ? 'bg-verde text-verde-tinta' : 'bg-painel text-texto'}`}
            >
              {l.pos}º
            </span>
          </li>
        ) : (
          <li key={i} />
        ),
      )}
    </ol>
  );
}

function LinhaRanking({ l, eu }: { l: Linha; eu: boolean }) {
  return (
    <li className={`flex h-12 items-center gap-3 rounded-xl px-3 ${eu ? 'border border-verde bg-painel' : ''}`}>
      <span className="w-14 text-sm text-suave">
        {l.pos}º{eu ? ' · você' : ''}
      </span>
      <span className="grow truncate font-semibold">{l.apelido}</span>
      <span className="font-display font-bold">{l.pontos}</span>
    </li>
  );
}

function textoSituacao(m: MinhaBalancada): { texto: string; cor: string } {
  switch (m.situacao.tipo) {
    case 'valida':
      return { texto: `${m.situacao.pos}º · ${m.situacao.pts} pts`, cor: 'text-texto' };
    case 'pendente':
      return { texto: 'pendente de sync', cor: 'text-alerta' };
    case 'conflito':
      return { texto: 'descartada (conflito)', cor: 'text-fraco' };
    case 'anulada':
      return { texto: 'anulada', cor: 'text-fraco' };
    default:
      return { texto: 'não contabilizada', cor: 'text-fraco' };
  }
}

function MinhasBalancadas({ minhas, dados }: { minhas: MinhaBalancada[]; dados: DadosDoJogo }) {
  if (minhas.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-painel p-4" aria-labelledby="minhas-t">
      <h2 id="minhas-t" className="m-0 text-xs font-semibold uppercase tracking-widest text-suave">
        Suas balançadas
      </h2>
      <ul className="m-0 flex list-none flex-col p-0" data-testid="minhas-balancadas">
        {minhas.map((m) => {
          const p = dados.pontos.find((x) => x.id === m.pontoId);
          const s = textoSituacao(m);
          return (
            <li key={m.chave} className="flex items-center justify-between border-b border-borda py-2 last:border-0">
              <span>
                {p ? nomeDaPista(p) : 'Pista'}
                {m.outroAparelho && <span className="text-suave"> · por outro aparelho</span>}
              </span>
              <span className={`text-sm font-semibold ${s.cor}`}>{s.texto}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
