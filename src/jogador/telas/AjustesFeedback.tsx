import { useSyncExternalStore } from 'react';
import { Icone } from '@/ui/Icone';
import { destravarSom, feedback, preferencias } from '../feedback';

/** Liga/desliga de som e vibração, por aparelho. */
export function AjustesFeedback() {
  const p = useSyncExternalStore(preferencias.inscrever, preferencias.atual);
  const linha = (rotulo: string, ligado: boolean, icone: 'som' | 'vibrar', iconeOff: 'somDesligado' | 'vibrarDesligado', alternar: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={alternar}
      className="flex min-h-12 items-center gap-3 border-b border-borda px-4 text-left text-[15px] last:border-0"
    >
      <Icone nome={ligado ? icone : iconeOff} tamanho={20} className={ligado ? 'text-verde' : 'text-suave'} />
      <span className="grow">{rotulo}</span>
      <span className={`relative h-7 w-12 rounded-full transition-colors ${ligado ? 'bg-verde' : 'bg-apagado'}`} aria-hidden="true">
        <span className={`absolute top-1 size-5 rounded-full bg-texto transition-[left] ${ligado ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
  return (
    <div className="flex flex-col rounded-[14px] border border-borda bg-painel">
      {linha('Som', p.som, 'som', 'somDesligado', () => {
        destravarSom();
        preferencias.definir({ som: !p.som });
        if (!p.som) feedback.esquentou();
      })}
      {linha('Vibração', p.vibracao, 'vibrar', 'vibrarDesligado', () => {
        preferencias.definir({ vibracao: !p.vibracao });
        if (!p.vibracao) feedback.pico(1);
      })}
    </div>
  );
}
