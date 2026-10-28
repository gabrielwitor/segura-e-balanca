import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icone } from '@/ui/Icone';
import { data } from '@/ui/tempo';
import { atualizarHistorico, db } from '../servicos';
import { useConexao } from '../dados';

/** RF-45: partidas de que o jogador participou; disponível offline depois do 1º carregamento. */
export function Historico({ uid, voltar }: { uid: string; voltar: () => void }) {
  const conexao = useConexao();
  const linhas = useLiveQuery(() => db.historico.orderBy('partidaId').toArray(), []);
  useEffect(() => {
    if (conexao === 'online') void atualizarHistorico(uid);
  }, [conexao, uid]);

  return (
    <>
      <header className="flex items-center gap-2">
        <button type="button" onClick={voltar} aria-label="Voltar ao ranking" className="-ml-3 flex size-11 items-center justify-center">
          <Icone nome="voltar" tamanho={22} />
        </button>
        <h1 className="m-0 font-display text-3xl font-bold">Histórico</h1>
      </header>
      {!linhas || linhas.length === 0 ? (
        <p className="m-0 text-suave">Nenhuma partida finalizada ainda.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {[...linhas]
            .sort((a, b) => b.numero - a.numero)
            .map((h) => (
              <li key={h.partidaId} className="flex items-center justify-between rounded-2xl border border-borda px-4 py-3">
                <span className="flex flex-col">
                  <span className="font-semibold">
                    Partida #{h.numero}
                    {h.finalizadaEm ? ` · ${data(h.finalizadaEm)}` : ''}
                  </span>
                  <span className="text-sm text-suave">
                    {h.jogadores} jogadores · {h.balancadas} {h.balancadas === 1 ? 'balançada' : 'balançadas'}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="font-display text-xl font-bold">{h.pos ? `${h.pos}º` : '—'}</span>
                  <span className="text-sm text-suave">{h.pontos} pts</span>
                </span>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}
