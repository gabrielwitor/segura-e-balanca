import { useState } from 'react';
import { emEmulador } from '@/firebase/app';
import type { DadosDoJogo } from '../dados';
import { relogio, sync } from '../servicos';
import { EVENTO_SIMULAR_BALANCO } from './Radar';

const ligado = () => emEmulador || new URLSearchParams(location.search).has('debug');

/** Seção 10.1: ferramentas da demonstração (reenvio, simular balanço, inspecionar a fila). */
export function PainelDebug({ dados }: { dados: DadosDoJogo }) {
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState('');
  if (!ligado()) return null;

  // A última balançada deste aparelho (a de outro aparelho não é nossa para reenviar).
  const ultima = dados.minhas.filter((m) => !m.outroAparelho).sort((a, b) => b.t - a.t)[0];

  const reenviar = async () => {
    const partidaId = dados.partida?.id;
    const e = ultima && dados.filas[ultima.pontoId]?.entradas[ultima.chave];
    if (!ultima || !e || !partidaId) return setMsg('Nada para reenviar.');
    const { uid, dispositivoId, v, t, fonte, lat, lng, accuracy } = e;
    try {
      await sync.reenviar({
        chave: ultima.chave,
        partidaId,
        pontoId: ultima.pontoId,
        entrada: { uid, dispositivoId, v, t, fonte, lat, lng, accuracy },
        status: 'pendente',
        tentativas: 0,
        proximaTentativa: 0,
        erro: null,
        criadoEm: t,
      });
      setMsg('Reenviada: o servidor tratou como no-op.');
    } catch (err) {
      setMsg(`Falhou: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="fixed top-1/2 left-0 z-40 flex -translate-y-1/2 items-center gap-2">
      <button type="button" onClick={() => setAberto((a) => !a)} className="h-11 rounded-r-xl border border-l-0 border-borda bg-painel px-2 text-xs font-semibold text-suave opacity-80 [writing-mode:vertical-rl]">
        {aberto ? 'Fechar debug' : 'Debug'}
      </button>
      {aberto && (
        <div className="w-72 max-w-[80vw] rounded-2xl border border-borda bg-painel p-3 text-xs text-suave shadow-xl">
          <div className="mb-2 font-mono">
            âncora: {relogio.ancorado ? 'monotônica' : 'relógio corrigido'} · saída: {dados.saida.length}
          </div>
          <ul className="m-0 mb-2 max-h-32 list-none overflow-auto p-0 font-mono">
            {dados.saida.map((i) => (
              <li key={i.chave}>
                {i.status} · tent. {i.tentativas}
                {i.erro ? ` · ${i.erro.slice(0, 30)}` : ''}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5">
            <button type="button" className="h-11 rounded-lg bg-apagado text-texto" onClick={() => window.dispatchEvent(new Event(EVENTO_SIMULAR_BALANCO))}>
              Simular balanço
            </button>
            <button type="button" className="h-11 rounded-lg bg-apagado text-texto" onClick={() => void reenviar()} data-testid="reenviar">
              Reenviar última balançada
            </button>
          </div>
          {msg && (
            <p className="mt-2 mb-0" role="status">
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
