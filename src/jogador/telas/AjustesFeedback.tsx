import { useState, useSyncExternalStore } from 'react';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { destravarSom, diagnostico, feedback, preferencias, vibracaoSuportada, type Diagnostico } from '../feedback';

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
/** Só o Safari (16.4+) deixa escolher se o som respeita a chave de silencioso. */
const temSessaoDeAudio = () => typeof navigator !== 'undefined' && 'audioSession' in navigator;

function textoDoTeste(d: Diagnostico, p: { som: boolean; noSilencioso: boolean }): string {
  if (!p.som) return 'Som desligado.';
  if (d.som === 'sem-suporte') return 'Este navegador não toca som.';
  if (d.som === 'aguardando-toque') return 'Som bloqueado pelo navegador. Toque em Testar de novo.';
  if (ehIphone() && !p.noSilencioso) return 'Não ouviu? O iPhone deve estar no silencioso: ligue "Tocar no modo silencioso".';
  return 'Não ouviu? Confira o volume de mídia.';
}

/** Liga/desliga de som (e vibração, no Android), teste e versão do app. */
export function AjustesFeedback() {
  const p = useSyncExternalStore(preferencias.inscrever, preferencias.atual);
  const [diag, setDiag] = useState<Diagnostico | null>(null);

  const chave = (id: string, rotulo: string, ligado: boolean, icone: NomeIcone, iconeOff: NomeIcone, mudar: (v: boolean) => void) => (
    <label htmlFor={id} className="flex min-h-12 items-center gap-3 border-b border-borda px-4 text-[15px]">
      <Icone nome={ligado ? icone : iconeOff} tamanho={20} className={ligado ? 'text-verde' : 'text-suave'} />
      <span className="grow">{rotulo}</span>
      <input
        id={id}
        type="checkbox"
        {...{ switch: '' }}
        checked={ligado}
        onChange={(e) => mudar(e.target.checked)}
        className={`shrink-0 accent-verde ${ehIphone() ? '' : 'size-6'}`}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col rounded-[14px] border border-borda bg-painel">
        {chave('aj-som', 'Som', p.som, 'som', 'somDesligado', (som) => {
          destravarSom();
          preferencias.definir({ som });
        })}
        {p.som &&
          temSessaoDeAudio() &&
          chave('aj-silencioso', 'Tocar no modo silencioso', p.noSilencioso, 'som', 'somDesligado', (noSilencioso) => {
            preferencias.definir({ noSilencioso });
            destravarSom();
          })}
        {vibracaoSuportada() && chave('aj-vibracao', 'Vibração', p.vibracao, 'vibrar', 'vibrarDesligado', (vibracao) => preferencias.definir({ vibracao }))}
        <button
          type="button"
          onClick={() => {
            feedback.testar();
            // O estado do áudio só muda depois do resume: lê logo em seguida.
            setTimeout(() => setDiag(diagnostico()), 150);
          }}
          className="flex min-h-12 items-center gap-3 px-4 text-left text-[15px]"
        >
          <Icone nome="play" tamanho={20} className="text-verde" />
          Testar som
        </button>
      </div>
      {p.noSilencioso && p.som && <p className="m-0 px-1 text-[13px] text-suave">Pausa a música de outros apps enquanto toca.</p>}
      {diag && (
        <p role="status" className="m-0 px-1 text-[13px] leading-snug text-suave">
          {textoDoTeste(diag, p)}
        </p>
      )}
      <p className="m-0 px-1 font-mono text-xs text-fraco">Versão {__VERSAO__}</p>
    </div>
  );
}
