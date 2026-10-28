import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icone } from '@/ui/Icone';
import { haQuanto } from '@/ui/tempo';
import { useAgora, useConexao, type DadosDoJogo, type MinhaBalancada, type Sessao } from '../dados';
import { db, sairDaConta } from '../servicos';
import { estaInstalado } from '../instalacao';
import { nomeDoPonto } from '../alvos';
import { AjustesFeedback } from './AjustesFeedback';
import { ChipConexao } from './Cabecalho';
import { Sobreposicao } from './Tela';

interface Linha {
  uid: string;
  apelido: string;
  pontos: number;
  pos: number;
}

const MEDALHAS = ['bg-[#F4D35E] text-[#2A2205]', 'bg-[#D9E1DC] text-[#1A2420]', 'bg-[#E0A46B] text-[#2A1605]'];

/** Tela 10 · ranking (RF-42, RF-43, RF-44), com carregando e vazio. */
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
  const eu = linhas.find((l) => l.uid === uid);
  const acima = eu ? linhas.filter((l) => l.pontos > eu.pontos).at(-1) : undefined;
  const subida = useSubida(uid, eu?.pos);

  // RF-30: o estado da conexão aparece sempre (chip); a linha de baixo diz se o ranking é final ou velho.
  const legenda = final
    ? dados.partida?.finalizadaEm
      ? `Oficial · ${new Date(dados.partida.finalizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Oficial'
    : conexao !== 'online'
      ? `Atualizado há ${sessao.ultimoPull ? haQuanto(agora - sessao.ultimoPull) : '—'}`
      : '';

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 font-display text-[30px] font-bold">Ranking</h1>
        <ChipConexao dados={dados} />
      </div>
      {legenda && (
        <p className="-mt-2 mb-0 text-sm text-suave" data-testid="ranking-frescor">
          {legenda}
        </p>
      )}

      {carregando ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Buscando o ranking">
          <div className="h-[72px] animate-pulse rounded-[18px] bg-painel" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-[10px] bg-painel" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 py-12 text-center">
          <span className="flex size-[76px] items-center justify-center rounded-full bg-painel text-suave">
            <Icone nome="trofeu" tamanho={34} />
          </span>
          <h2 className="m-0 font-display text-2xl font-bold">Ninguém pontuou ainda</h2>
        </div>
      ) : (
        <>
          {eu && (
            <section aria-label="Sua posição" className="flex items-center gap-3.5 rounded-[18px] border-2 border-verde bg-[#12301F] px-4 py-3.5">
              <span className="min-w-[52px] font-display text-[34px] font-bold text-verde">{eu.pos}º</span>
              <span className="flex grow flex-col">
                <strong className="text-base">Você · {apelido}</strong>
                {acima && !final && <span className="text-[13px] text-[#C6D6CD]">{acima.pontos - eu.pontos} atrás do {acima.pos}º</span>}
              </span>
              <span className="font-display text-[22px] font-bold">{eu.pontos}</span>
            </section>
          )}
          <ol aria-label="Classificação" className="m-0 flex list-none flex-col p-0" data-testid="ranking-lista">
            {linhas.map((l) => (
              <li
                // Subiu de posição: sua linha remonta e sobe de onde estava, com um brilho.
                key={l.uid === uid && subida ? `${l.uid}-${subida.k}` : l.uid}
                className={`flex min-h-12 items-center gap-3 border-b border-[#1A2B23] px-1 ${l.uid === uid ? 'bg-[#12301F]' : ''} ${l.uid === uid && subida ? 'efeito-sobe-linha' : ''}`}
                style={l.uid === uid && subida ? ({ '--de': `${subida.n * 48}px` } as React.CSSProperties) : undefined}
              >
                <span className={`flex size-[30px] shrink-0 items-center justify-center rounded-full text-sm font-bold ${MEDALHAS[l.pos - 1] ?? 'bg-[#1A2B23] text-suave'}`}>
                  {l.pos}
                </span>
                <span className={`flex grow items-center gap-1.5 truncate text-base ${l.uid === uid ? 'font-bold' : 'font-medium'}`}>
                  <span className="truncate">{l.apelido}</span>
                  {l.uid === uid && subida && (
                    <span className="efeito-surge-selo shrink-0 rounded-full bg-verde px-2 py-0.5 text-xs font-bold text-verde-tinta">
                      <span className="sr-only">subiu </span>↑{subida.n}
                    </span>
                  )}
                </span>
                <span className="font-display text-[17px] font-bold">{l.pontos}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <MinhasBalancadas minhas={dados.minhas} dados={dados} />

      <div className="grow" />
      <nav aria-label="Mais" className="flex flex-col rounded-[14px] border border-borda bg-painel">
        <button type="button" onClick={abrirHistorico} className="flex min-h-12 items-center justify-between border-b border-borda px-4 text-left text-[15px]">
          Partidas anteriores
          <span className="flex items-center gap-1.5 text-sm text-suave">
            {historico}
            <Icone nome="avancar" tamanho={16} />
          </span>
        </button>
        {!estaInstalado() && (
          <button type="button" onClick={abrirInstalar} className="flex min-h-12 items-center justify-between border-b border-borda px-4 text-left text-[15px]">
            Instalar o app
            <Icone nome="avancar" tamanho={16} className="text-suave" />
          </button>
        )}
        <SairDaConta email={sessao.jogador?.email ?? null} pendentes={dados.pendentes} />
      </nav>
      <div className="mb-4">
        <AjustesFeedback />
      </div>
    </>
  );
}

function chip(m: MinhaBalancada): { texto: string; cls: string } {
  switch (m.situacao.tipo) {
    case 'valida':
      return { texto: `${m.situacao.pos}º · ${m.situacao.pts} pts`, cls: 'bg-[#1A2B23] text-texto' };
    case 'pendente':
      return { texto: 'Pendente', cls: 'bg-morno text-morno-texto' };
    case 'conflito':
      return { texto: 'Descartada: conflito', cls: 'bg-[#26302B] text-suave' };
    case 'anulada':
      return { texto: 'Anulada', cls: 'bg-[#26302B] text-suave' };
    default:
      return { texto: 'Não contou', cls: 'bg-[#26302B] text-suave' };
  }
}

function MinhasBalancadas({ minhas, dados }: { minhas: MinhaBalancada[]; dados: DadosDoJogo }) {
  if (minhas.length === 0) return null;
  return (
    <section aria-labelledby="minhas-t" className="flex flex-col gap-1.5">
      <h2 id="minhas-t" className="m-0 text-xs font-bold tracking-widest text-suave">
        SUAS BALANÇADAS
      </h2>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="minhas-balancadas">
        {minhas.map((m) => {
          const p = dados.pontos.find((x) => x.id === m.pontoId);
          const c = chip(m);
          return (
            <li key={m.chave} className="flex min-h-11 items-center justify-between gap-2.5 rounded-xl bg-painel px-3.5">
              <span className="text-[15px]">
                {p ? nomeDoPonto(p) : 'Ponto'}
                {m.outroAparelho && <span className="text-suave"> · outro aparelho</span>}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold ${c.cls}`}>{c.texto}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Sair da conta, com confirmação; bloqueado enquanto houver balançadas pendentes. */
function SairDaConta({ email, pendentes }: { email: string | null; pendentes: number }) {
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    cancelar.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aberto]);

  const confirmar = async () => {
    setSaindo(true);
    setErro(null);
    try {
      await sairDaConta();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu para sair.');
      setSaindo(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
        className="flex min-h-12 items-center gap-3 px-4 text-left text-[15px]"
      >
        <Icone nome="sair" tamanho={20} className="text-suave" />
        <span className="flex min-w-0 grow flex-col">
          Sair da conta
          {email && <span className="truncate text-[13px] text-suave">{email}</span>}
        </span>
      </button>
      {aberto && (
        <Sobreposicao>
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <button type="button" tabIndex={-1} aria-label="Fechar" onClick={() => setAberto(false)} className="absolute inset-0 bg-[rgba(5,10,8,0.7)]" />
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="sair-t"
              className="relative flex w-full max-w-[440px] flex-col gap-4 rounded-t-3xl border-t border-borda bg-painel px-5 pt-5 pb-[max(24px,env(safe-area-inset-bottom))]"
            >
              <h2 id="sair-t" className="m-0 font-display text-2xl font-bold">
                Sair da conta?
              </h2>
              {pendentes > 0 ? (
                <p role="alert" className="m-0 rounded-2xl border border-alerta-borda bg-alerta-fundo px-4 py-3 text-[15px] text-[#FFE6B0]">
                  Sincronize antes de sair: {pendentes} {pendentes === 1 ? 'balançada não enviada' : 'balançadas não enviadas'}.
                </p>
              ) : (
                <p className="m-0 text-[15px] text-[#C6D6CD]">Seus pontos continuam salvos. Entre de novo quando quiser.</p>
              )}
              {erro && (
                <p role="alert" className="m-0 text-sm text-erro-texto">
                  {erro}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <button ref={cancelar} type="button" onClick={() => setAberto(false)} className="h-[52px] rounded-2xl border border-borda font-semibold">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendentes > 0 || saindo}
                  onClick={() => void confirmar()}
                  className="h-[52px] rounded-2xl bg-texto font-bold text-noite disabled:opacity-40"
                >
                  {saindo ? 'Saindo…' : 'Sair'}
                </button>
              </div>
            </div>
          </div>
        </Sobreposicao>
      )}
    </>
  );
}

/** Última posição vista por jogador (sobrevive à troca de aba). */
const ultimaPosicao = new Map<string, number>();

/** Quantas posições subiu desde a última vez que o ranking foi visto. */
function useSubida(uid: string, pos: number | undefined): { n: number; k: number } | null {
  const [subida, setSubida] = useState<{ n: number; k: number } | null>(null);
  useEffect(() => {
    if (pos == null) return;
    const antes = ultimaPosicao.get(uid);
    ultimaPosicao.set(uid, pos);
    if (antes != null && pos < antes) setSubida((s) => ({ n: antes - pos, k: (s?.k ?? 0) + 1 }));
  }, [uid, pos]);
  return subida;
}
