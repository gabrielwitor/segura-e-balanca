import { useState, useSyncExternalStore } from 'react';
import { Icone } from '@/ui/Icone';
import { destravarSom, diagnostico, feedback, preferencias, type Diagnostico } from '../feedback';

const TEXTO_SOM: Record<Diagnostico['som'], string> = {
  ativo: 'Som ativo. Se não ouviu, confira o volume e a chave de silencioso.',
  'aguardando-toque': 'Som bloqueado pelo navegador. Toque em Testar.',
  'sem-suporte': 'Este navegador não toca som.',
};

const TEXTO_VIBRACAO: Record<Diagnostico['vibracao'], string> = {
  suportada: 'Vibração ativa.',
  'iphone-so-no-toque': 'No iPhone, vibra só ao tocar na tela (iOS 18+).',
  'sem-suporte': 'Este aparelho não vibra.',
};

/** Liga/desliga de som e vibração, teste e versão do app. */
export function AjustesFeedback() {
  const p = useSyncExternalStore(preferencias.inscrever, preferencias.atual);
  const [diag, setDiag] = useState<Diagnostico | null>(null);

  const linha = (rotulo: string, ligado: boolean, icone: 'som' | 'vibrar', iconeOff: 'somDesligado' | 'vibrarDesligado', alternar: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={alternar}
      className="flex min-h-12 items-center gap-3 border-b border-borda px-4 text-left text-[15px]"
    >
      <Icone nome={ligado ? icone : iconeOff} tamanho={20} className={ligado ? 'text-verde' : 'text-suave'} />
      <span className="grow">{rotulo}</span>
      <span className={`relative h-7 w-12 rounded-full transition-colors ${ligado ? 'bg-verde' : 'bg-apagado'}`} aria-hidden="true">
        <span className={`absolute top-1 size-5 rounded-full bg-texto transition-[left] ${ligado ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col rounded-[14px] border border-borda bg-painel">
        {linha('Som', p.som, 'som', 'somDesligado', () => {
          destravarSom();
          preferencias.definir({ som: !p.som });
        })}
        {linha('Vibração', p.vibracao, 'vibrar', 'vibrarDesligado', () => preferencias.definir({ vibracao: !p.vibracao }))}
        <button
          type="button"
          onClick={() => {
            feedback.testar();
            // O estado do áudio só muda depois do resume: lê no próximo quadro.
            setTimeout(() => setDiag(diagnostico()), 150);
          }}
          className="flex min-h-12 items-center gap-3 px-4 text-left text-[15px]"
        >
          <Icone nome="play" tamanho={20} className="text-verde" />
          Testar som e vibração
        </button>
      </div>
      {diag && (
        <p role="status" className="m-0 px-1 text-[13px] leading-snug text-suave">
          {p.som ? TEXTO_SOM[diag.som] : 'Som desligado nos ajustes.'} {p.vibracao ? TEXTO_VIBRACAO[diag.vibracao] : 'Vibração desligada nos ajustes.'}
        </p>
      )}
      <p className="m-0 px-1 font-mono text-xs text-fraco">Versão {__VERSAO__}</p>
    </div>
  );
}
