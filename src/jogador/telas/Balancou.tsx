import { Icone } from '@/ui/Icone';
import { hora } from '@/ui/tempo';
import { useConexao, type DadosDoJogo } from '../dados';
import { nomeDaPista } from './Radar';

/** Tela 3 · Balançada (RF-23, RF-33): feedback forte, legível ao sol. */
export function Balancou({ chave, dados, voltar }: { chave: string; dados: DadosDoJogo; voltar: () => void }) {
  const conexao = useConexao();
  const minha = dados.minhas.find((m) => m.chave === chave);
  const ponto = dados.pontos.find((p) => p.id === minha?.pontoId);
  const pista = ponto ? nomeDaPista(ponto) : 'a pista';
  const s = minha?.situacao ?? { tipo: 'pendente' as const };

  let v: { ok: boolean; titulo: string; sub: string; chip: string };
  switch (s.tipo) {
    case 'valida':
      v = {
        ok: true,
        titulo: `${s.pos}º lugar · +${s.pts}`,
        sub: `${pista} conquistada. Se alguém sem internet balançou antes, a posição se ajusta quando essa pessoa sincronizar.`,
        chip: 'Sincronizado · ranking provisório',
      };
      break;
    case 'pendente':
      v = {
        ok: true,
        titulo: 'Balançou!',
        sub:
          conexao === 'online'
            ? `Registrada às ${hora(minha?.t ?? Date.now())} na ${pista}. Enviando para o servidor…`
            : `Registrada às ${hora(minha?.t ?? Date.now())} na ${pista}. Sua posição sai quando o celular voltar a ter internet.`,
        chip: conexao === 'online' ? 'Sincronizando…' : 'Pendente de sincronização',
      };
      break;
    case 'conflito':
      v = {
        ok: false,
        titulo: 'Já valeu antes',
        sub: 'Outro aparelho seu balançou esta pista mais cedo. Vale a balançada de menor horário.',
        chip: 'Sincronizada · descartada por conflito',
      };
      break;
    case 'pausa':
      v = { ok: false, titulo: 'Não contou', sub: 'Essa balançada aconteceu enquanto o jogo estava pausado, então não entra no ranking.', chip: 'Não contabilizada' };
      break;
    case 'desativado':
      v = { ok: false, titulo: 'Não contou', sub: 'Essa pista foi desativada pelos organizadores antes da sua balançada.', chip: 'Não contabilizada' };
      break;
    case 'rejeitada':
      v = { ok: false, titulo: 'Não contou', sub: 'A partida já tinha sido finalizada quando a balançada chegou ao servidor.', chip: 'Não contabilizada' };
      break;
    case 'anulada':
      v = { ok: false, titulo: 'Anulada', sub: 'Os organizadores anularam esta balançada. Você pode balançar a pista de novo.', chip: 'Anulada pelo admin' };
      break;
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] ${v.ok ? 'bg-verde text-verde-tinta' : 'bg-[#1e2622] text-texto'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="balancou-titulo"
      data-testid="balancou"
    >
      <div className="relative mt-[12vh] flex size-48 items-center justify-center">
        {v.ok && (
          <>
            <span className="animate-onda absolute inset-0 rounded-full border-4 border-verde-tinta" aria-hidden="true" />
            <span className="animate-onda absolute inset-0 rounded-full border-4 border-verde-tinta [animation-delay:250ms]" aria-hidden="true" />
          </>
        )}
        <span className={`flex size-36 items-center justify-center rounded-full ${v.ok ? 'bg-verde-tinta text-verde' : 'bg-apagado text-texto'}`}>
          <Icone nome={v.ok ? 'check' : 'anular'} tamanho={72} strokeWidth={2.6} />
        </span>
      </div>
      <h1 id="balancou-titulo" className="mt-8 mb-0 text-center font-display text-5xl font-bold tracking-tight">
        {v.titulo}
      </h1>
      <p className="mt-4 mb-0 max-w-sm text-center text-lg leading-snug font-medium">{v.sub}</p>
      <span
        className={`mt-6 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${v.ok ? 'bg-verde-tinta/15' : 'bg-apagado'}`}
        data-testid="balancou-status"
      >
        <span className={`size-2 rounded-full ${s.tipo === 'pendente' ? 'bg-[#8a6500]' : v.ok ? 'bg-verde-tinta' : 'bg-suave'}`} />
        {v.chip}
      </span>
      <div className="grow" />
      <button
        type="button"
        onClick={voltar}
        className={`h-14 w-full max-w-sm rounded-2xl font-display text-lg font-bold ${v.ok ? 'bg-verde-tinta text-verde' : 'bg-texto text-noite'}`}
      >
        Voltar ao radar
      </button>
    </div>
  );
}
