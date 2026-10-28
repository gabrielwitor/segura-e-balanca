import { Icone } from '@/ui/Icone';
import type { DadosDoJogo } from '../dados';
import { useConexao } from '../dados';

/** Topo do radar: apelido, posição provisória, pontos e o estado de conexão (RF-30). */
export function Cabecalho({ uid, apelido, dados }: { uid: string; apelido: string; dados: DadosDoJogo }) {
  const minha = dados.ranking.ranking.find((l) => l.uid === uid);
  const oficial = dados.partida?.estado === 'finalizada';
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="truncate text-sm text-suave">
          {apelido}
          {minha ? ` · ${minha.pos}º ${oficial ? 'final' : 'provisório'}` : ''}
        </div>
        <div className="font-display text-2xl font-bold leading-tight" data-testid="meus-pontos">
          {minha?.pontos ?? 0} pts
        </div>
      </div>
      <ChipConexao pendentes={dados.pendentes} />
    </header>
  );
}

export function ChipConexao({ pendentes }: { pendentes: number }) {
  const estado = useConexao();
  const contador = (cor: string) =>
    pendentes > 0 ? (
      <span
        aria-label={`${pendentes} ${pendentes === 1 ? 'balançada pendente' : 'balançadas pendentes'}`}
        className={`flex h-6 items-center gap-0.5 rounded-full px-2 text-xs font-bold ${cor}`}
      >
        <Icone nome="seta" tamanho={11} strokeWidth={3} />
        {pendentes}
      </span>
    ) : null;

  if (estado === 'online')
    return (
      <div role="status" data-testid="conexao" className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-borda bg-painel px-3 text-sm font-semibold text-[#d3e0d8]">
        <span className="size-2 rounded-full bg-verde" />
        {pendentes > 0 ? 'Sincronizando' : 'Sincronizado'}
        {contador('bg-verde text-verde-tinta')}
      </div>
    );
  if (estado === 'sem-rede')
    return (
      <div role="status" data-testid="conexao" className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-alerta-borda bg-alerta-fundo pl-3 pr-1.5 text-sm font-semibold text-morno-texto">
        <Icone nome="semRede" tamanho={15} strokeWidth={2.2} />
        Sem rede
        {contador('bg-alerta text-[#2a1e05]')}
      </div>
    );
  return (
    <div role="status" data-testid="conexao" className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-erro-borda bg-erro-fundo pl-3 pr-1.5 text-sm font-semibold text-erro-texto">
      <Icone nome="servidor" tamanho={15} strokeWidth={2.2} />
      Servidor indisponível
      {contador('bg-erro text-[#2a0b07]')}
    </div>
  );
}
