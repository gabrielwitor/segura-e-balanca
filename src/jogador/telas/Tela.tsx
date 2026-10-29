import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Moldura do jogador: coluna de celular, centrada em telas largas. */
export function Tela({ children, carregando, className = '' }: { children?: ReactNode; carregando?: boolean; className?: string }) {
  return (
    <div className="min-h-full bg-noite text-texto">
      <main
        className={`mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] ${className}`}
      >
        {carregando ? (
          <div className="m-auto flex flex-col items-center gap-3 text-suave" role="status">
            <Girando />
            Carregando…
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

export function Girando({ tamanho = 22 }: { tamanho?: number }) {
  return (
    <svg className="animate-spin" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

export function BotaoPrimario({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-verde px-5 font-display text-lg font-bold text-verde-tinta disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function BotaoSecundario({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-borda px-5 font-semibold text-texto ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Logo({ grande }: { grande?: boolean }) {
  return (
    <h1 className={`m-0 font-display font-bold leading-[0.95] tracking-tight ${grande ? 'text-6xl' : 'text-3xl'}`}>
      Segura e<br />
      <span className="text-verde">Balança</span>
    </h1>
  );
}

/**
 * Painéis e telas por cima do jogo vão direto no <body>: dentro das abas (puxar para atualizar),
 * o Safari do iOS os deixava atrás da barra de navegação. Fora da Tela, a cor do texto vem daqui.
 */
export function Sobreposicao({ children }: { children: ReactNode }) {
  return createPortal(<div className="contents text-texto">{children}</div>, document.body);
}
