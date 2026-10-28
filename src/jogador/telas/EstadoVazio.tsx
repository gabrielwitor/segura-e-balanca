import type { Partida } from '@/dominio/tipos';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { hora, haQuanto } from '@/ui/tempo';
import { useAgora } from '../dados';

/** Tela 13 · pausado (RF-18), partida em rascunho, sem pontos e encerrada. */
export function EstadoVazio({
  partida,
  semPontos,
  ultimoPull,
  minhaPosicao,
  irParaRanking,
}: {
  partida: Partida | undefined;
  semPontos: boolean;
  ultimoPull: number | undefined;
  minhaPosicao?: { pos: number; pontos: number };
  irParaRanking: () => void;
}) {
  const agora = useAgora(5000);
  const verificado = ultimoPull ? `Verificado há ${haQuanto(agora - ultimoPull)}` : '';
  let t: { icone: NomeIcone; cor: string; titulo: string; texto: string; status: string; botao: string; forte: boolean };
  if (partida?.estado === 'pausada') {
    const desde = partida.pausas.at(-1)?.de;
    t = { icone: 'pausa', cor: 'bg-morno text-morno-texto', titulo: 'Jogo pausado', texto: 'Balançadas agora não contam.', status: desde ? `Desde ${hora(desde).slice(0, 5)}` : '', botao: 'Ver ranking', forte: false };
  } else if (partida?.estado === 'finalizada')
    t = {
      icone: 'bandeira',
      cor: 'bg-[#12301F] text-verde',
      titulo: 'Partida encerrada',
      texto: minhaPosicao ? `Você terminou em ${minhaPosicao.pos}º, com ${minhaPosicao.pontos} pts.` : '',
      status: '',
      botao: 'Ver ranking final',
      forte: true,
    };
  else if (!partida || partida.estado === 'rascunho')
    t = { icone: 'relogio', cor: 'bg-painel text-suave', titulo: 'A partida ainda não começou', texto: 'O radar aparece quando abrir.', status: verificado, botao: 'Ver ranking', forte: false };
  else t = { icone: 'local', cor: 'bg-painel text-suave', titulo: semPontos ? 'Nenhum ponto no momento' : 'Sem pontos', texto: '', status: verificado, botao: 'Ver ranking', forte: false };

  return (
    <section className="flex grow flex-col" data-testid="estado-vazio">
      <div className="flex grow flex-col items-center justify-center gap-4 px-2 text-center">
        <span className={`flex size-24 items-center justify-center rounded-full ${t.cor}`}>
          <Icone nome={t.icone} tamanho={40} />
        </span>
        <h2 className="m-0 font-display text-[30px] leading-tight font-bold">{t.titulo}</h2>
        {t.texto && <p className="m-0 max-w-xs text-base text-[#C6D6CD]">{t.texto}</p>}
        {t.status && <p className="m-0 text-[13px] text-suave">{t.status}</p>}
      </div>
      <button
        type="button"
        onClick={irParaRanking}
        className={`mb-4 h-14 rounded-2xl font-display text-[17px] font-bold ${t.forte ? 'bg-verde text-verde-tinta' : 'border border-borda text-texto'}`}
      >
        {t.botao}
      </button>
    </section>
  );
}
