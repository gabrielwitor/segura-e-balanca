import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icone } from '@/ui/Icone';
import { data } from '@/ui/tempo';
import { atualizarHistorico, db } from '../servicos';
import { useConexao } from '../dados';

const MEDALHAS = ['bg-[#F4D35E] text-[#2A2205]', 'bg-[#D9E1DC] text-[#1A2420]', 'bg-[#E0A46B] text-[#2A1605]'];

/** Tela 11 · partidas anteriores (RF-45), disponível offline depois do 1º carregamento. */
export function Historico({ uid, voltar }: { uid: string; voltar: () => void }) {
  const conexao = useConexao();
  const linhas = useLiveQuery(() => db.historico.toArray(), []);
  useEffect(() => {
    if (conexao === 'online') void atualizarHistorico(uid);
  }, [conexao, uid]);

  return (
    <>
      <header className="flex items-center gap-1">
        <button type="button" onClick={voltar} aria-label="Voltar ao ranking" className="-ml-2.5 flex size-11 items-center justify-center">
          <Icone nome="voltar" tamanho={24} />
        </button>
        <h1 className="m-0 font-display text-[28px] font-bold">Partidas anteriores</h1>
      </header>
      {!linhas || linhas.length === 0 ? (
        <p className="m-0 text-suave">Nenhuma partida finalizada ainda.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {[...linhas]
            .sort((a, b) => b.numero - a.numero)
            .map((h) => (
              <li key={h.partidaId} className="flex items-center gap-3.5 rounded-2xl border border-borda px-4 py-3.5">
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-[14px] font-display text-xl font-bold ${h.pos ? (MEDALHAS[h.pos - 1] ?? 'bg-[#1A2B23] text-texto') : 'bg-[#1A2B23] text-suave'}`}
                >
                  {h.pos ? `${h.pos}º` : '—'}
                </span>
                <span className="flex grow flex-col">
                  <strong className="text-base">
                    Partida #{h.numero}
                    {h.finalizadaEm ? ` · ${data(h.finalizadaEm)}` : ''}
                  </strong>
                  <span className="text-[13px] text-suave">
                    {h.jogadores} jogadores · {h.balancadas} {h.balancadas === 1 ? 'balançada' : 'balançadas'}
                  </span>
                </span>
                <span className="font-display text-lg font-bold">{h.pontos}</span>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}
