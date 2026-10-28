import { useEffect, useRef, useState } from 'react';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { hora } from '@/ui/tempo';
import type { DadosDoJogo } from '../dados';
import { useConexao } from '../dados';
import { monitor, sync } from '../servicos';
import { nomeDaPista } from './Radar';

/** Topo do jogo: apelido, posição provisória, pontos e o estado de conexão (RF-30). */
export function Cabecalho({ uid, apelido, dados }: { uid: string; apelido: string; dados: DadosDoJogo }) {
  const minha = dados.ranking.ranking.find((l) => l.uid === uid);
  const oficial = dados.partida?.estado === 'finalizada';
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-px">
        <div className="truncate text-[13px] text-suave">
          {apelido}
          {minha ? ` · ${minha.pos}º ${oficial ? 'final' : 'provisório'}` : ''}
        </div>
        <div className="font-display text-[26px] leading-tight font-bold" data-testid="meus-pontos">
          {minha?.pontos ?? 0} pts
        </div>
      </div>
      <ChipConexao dados={dados} />
    </header>
  );
}

const ESTILO = {
  online: { texto: 'Sincronizado', cls: 'border-borda bg-painel text-[#d3e0d8]', ponto: 'bg-verde', cont: 'bg-verde text-verde-tinta' },
  'sem-rede': { texto: 'Sem rede', cls: 'border-alerta-borda bg-alerta-fundo text-morno-texto', ponto: 'bg-alerta', cont: 'bg-alerta text-[#2a1e05]' },
  'servidor-indisponivel': { texto: 'Servidor fora', cls: 'border-erro-borda bg-erro-fundo text-erro-texto', ponto: 'bg-erro', cont: 'bg-erro text-[#2a0b07]' },
} as const;

/** Chip tocável: abre o painel com o estado da conexão e as pendências. */
export function ChipConexao({ dados }: { dados: DadosDoJogo }) {
  const estado = useConexao();
  const [aberto, setAberto] = useState(false);
  const e = ESTILO[estado];
  const pendentes = dados.pendentes;
  const texto = estado === 'online' && pendentes > 0 ? 'Enviando' : e.texto;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        data-testid="conexao"
        aria-label={`${texto}${pendentes ? `, ${pendentes} ${pendentes === 1 ? 'balançada pendente' : 'balançadas pendentes'}` : ''}. Ver detalhes`}
        className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-0 pr-1.5 pl-3.5 text-sm font-semibold ${e.cls}`}
      >
        <span className={`size-2 rounded-full ${e.ponto}`} />
        {texto}
        {pendentes > 0 && <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[13px] font-bold ${e.cont}`}>{pendentes}</span>}
        <Icone nome="avancar" tamanho={16} />
      </button>
      {aberto && <PainelConexao dados={dados} fechar={() => setAberto(false)} />}
    </>
  );
}

const PAINEL: Record<string, { titulo: string; texto: string; icone: NomeIcone; cor: string }> = {
  online: { titulo: 'Tudo sincronizado', texto: '', icone: 'check', cor: 'bg-[#12301F] text-verde' },
  'sem-rede': { titulo: 'Sem internet', texto: 'Continue jogando. Enviamos quando a internet voltar.', icone: 'semRede', cor: 'bg-morno text-morno-texto' },
  'servidor-indisponivel': { titulo: 'Servidor não responde', texto: 'Continue jogando. Reenviamos sozinhos.', icone: 'servidor', cor: 'bg-erro-fundo text-erro-texto' },
};

function PainelConexao({ dados, fechar }: { dados: DadosDoJogo; fechar: () => void }) {
  const estado = useConexao();
  const p = PAINEL[estado]!;
  const pendentes = dados.saida.filter((i) => i.status !== 'rejeitada');
  const [tentando, setTentando] = useState(false);
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fecharRef.current?.focus();
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && fechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [fechar]);

  const tentarAgora = async () => {
    setTentando(true);
    try {
      if ((await monitor.heartbeat()) === 'online') await sync.aoReconectar();
    } finally {
      setTentando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" tabIndex={-1} aria-label="Fechar" onClick={fechar} className="absolute inset-0 bg-[rgba(5,10,8,0.7)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="con-t"
        className="relative flex w-full max-w-[440px] flex-col gap-4 rounded-t-3xl border-t border-borda bg-painel px-5 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))]"
      >
        <span className="h-[5px] w-10 self-center rounded-full bg-[#3A4A41]" aria-hidden="true" />
        <div className="flex items-center gap-3.5">
          <span className={`flex size-[52px] shrink-0 items-center justify-center rounded-2xl ${p.cor}`}>
            <Icone nome={p.icone} tamanho={26} />
          </span>
          <h2 id="con-t" className="m-0 font-display text-2xl font-bold">
            {p.titulo}
          </h2>
        </div>
        {p.texto && <p className="m-0 text-base text-[#D3E0D8]">{p.texto}</p>}
        {pendentes.length > 0 && (
          <section aria-labelledby="pend-t" className="flex flex-col gap-2">
            <h3 id="pend-t" className="m-0 text-xs font-bold tracking-widest text-suave">
              PENDENTES
            </h3>
            <ul className="m-0 list-none rounded-[14px] border border-borda bg-radar p-0">
              {pendentes.map((i) => {
                const ponto = dados.pontos.find((x) => x.id === i.pontoId);
                return (
                  <li key={i.chave} className="flex min-h-12 items-center justify-between border-b border-borda px-3.5 text-[15px] last:border-0">
                    <span>{ponto ? nomeDaPista(ponto) : 'Pista'}</span>
                    <span className="text-[13px] text-suave">{hora(i.entrada.t)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div className="flex flex-col gap-2.5">
          {estado === 'servidor-indisponivel' && (
            <button type="button" onClick={() => void tentarAgora()} disabled={tentando} className="h-[52px] rounded-2xl bg-texto font-bold text-noite disabled:opacity-60">
              {tentando ? 'Tentando…' : 'Tentar agora'}
            </button>
          )}
          <button ref={fecharRef} type="button" onClick={fechar} className="h-[52px] rounded-2xl border border-borda font-semibold">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
