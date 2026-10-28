import { Component, type ReactNode } from 'react';

/** Um erro de renderização não pode deixar a tela em branco: mostra saída e preserva os dados locais. */
export class FalhaGeral extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error) {
    console.error('Falha de renderização', erro);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-noite p-6 text-center text-texto">
        <h1 className="m-0 font-display text-3xl font-bold">Algo deu errado</h1>
        <p className="m-0 max-w-xs text-suave">Suas balançadas continuam guardadas no celular.</p>
        <button type="button" onClick={() => location.reload()} className="h-14 rounded-2xl bg-verde px-6 font-display text-lg font-bold text-verde-tinta">
          Recarregar
        </button>
      </div>
    );
  }
}
