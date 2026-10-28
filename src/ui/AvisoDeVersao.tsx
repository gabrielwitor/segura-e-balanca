import { useRegisterSW } from 'virtual:pwa-register/react';

/** Seção 15.5: registerType "prompt" — o jogador escolhe quando atualizar. */
export function AvisoDeVersao() {
  const {
    needRefresh: [precisa, setPrecisa],
    updateServiceWorker,
  } = useRegisterSW();
  if (!precisa) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-[1000] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-borda bg-painel p-3 pl-4 text-texto shadow-xl"
    >
      <span className="grow text-sm font-medium">Nova versão disponível</span>
      <button type="button" className="h-11 rounded-xl px-3 text-sm text-suave" onClick={() => setPrecisa(false)}>
        Depois
      </button>
      <button
        type="button"
        className="h-11 rounded-xl bg-verde px-4 text-sm font-bold text-verde-tinta"
        onClick={() => void updateServiceWorker(true)}
      >
        Atualizar
      </button>
    </div>
  );
}
