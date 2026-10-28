import { useEffect, useRef, type ReactNode } from 'react';

export function Botao({
  variante = 'secundario',
  className = '',
  ...props
}: React.ComponentProps<'button'> & { variante?: 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'contorno-claro' | 'contorno-alerta' }) {
  const v = {
    primario: 'bg-mata text-white hover:bg-mata-escura',
    secundario: 'border border-[#C9C3B5] bg-white text-tinta hover:bg-areia',
    perigo: 'bg-perigo text-white hover:bg-[#912018]',
    fantasma: 'text-tinta hover:bg-areia',
    // Sobre o cabeçalho escuro.
    'contorno-claro': 'border-2 border-[#E8F2EC] text-[#E8F2EC] hover:bg-white/10',
    'contorno-alerta': 'border-2 border-[#FF8A80] text-[#FFB4AD] hover:bg-white/10',
  }[variante];
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}
      {...props}
    />
  );
}

export function Campo({ id, rotulo, ...props }: { id: string; rotulo: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-tinta-suave">
        {rotulo}
      </label>
      <input id={id} className="h-11 rounded-lg border border-[#C9C3B5] bg-white px-2.5 text-[15px] text-tinta outline-none focus:border-mata" {...props} />
    </div>
  );
}

/** Diálogo de confirmação (role="alertdialog"), foco preso no primeiro botão. */
export function Confirmar({
  titulo,
  children,
  rotuloOk,
  perigo,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  titulo: string;
  children: ReactNode;
  rotuloOk: string;
  perigo?: boolean;
  ocupado?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const cancelar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelar.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoCancelar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aoCancelar]);
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/55 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmar-t"
        className="flex w-full max-w-[520px] flex-col gap-4 rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-xl"
      >
        <h2 id="confirmar-t" className="m-0 text-xl font-bold text-tinta">
          {titulo}
        </h2>
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-[#3F3F46]">{children}</div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Botao ref={cancelar} onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao variante={perigo ? 'perigo' : 'primario'} onClick={aoConfirmar} disabled={ocupado} aria-busy={ocupado}>
            {rotuloOk}
          </Botao>
        </div>
      </div>
    </div>
  );
}

export function Selo({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'verde' | 'neutro' | 'alerta' | 'perigo' }) {
  const c = {
    verde: 'bg-mata-clara text-mata-escura',
    neutro: 'bg-areia text-tinta-suave',
    alerta: 'bg-[#FFFBEB] text-[#713F12]',
    perigo: 'bg-[#FEE4E2] text-perigo-texto',
  }[tom];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c}`}>{children}</span>;
}
