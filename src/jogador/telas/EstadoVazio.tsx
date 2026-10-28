import type { Partida } from '@/dominio/tipos';
import { Icone } from '@/ui/Icone';
import { haQuanto } from '@/ui/tempo';
import { useAgora } from '../dados';
import { BotaoSecundario } from './Tela';

/** Tela 7 · Sem pontos / pausado (RF-18), e partida em rascunho ou encerrada. */
export function EstadoVazio({
  partida,
  semPontos,
  ultimoPull,
  irParaRanking,
}: {
  partida: Partida | undefined;
  semPontos: boolean;
  ultimoPull: number | undefined;
  irParaRanking: () => void;
}) {
  const agora = useAgora(5000);
  let t: { icone: 'pausa' | 'local' | 'bandeira' | 'relogio'; titulo: string; texto: string; status: string };
  const verificacao = ultimoPull ? `Última verificação há ${haQuanto(agora - ultimoPull)}.` : 'Atualiza sozinho quando houver internet.';
  if (partida?.estado === 'pausada')
    t = {
      icone: 'pausa',
      titulo: 'Jogo pausado',
      texto: 'Os organizadores pausaram a partida. Balançadas feitas agora não contam. O radar volta assim que a partida for retomada.',
      status: 'Atualiza sozinho quando houver internet.',
    };
  else if (partida?.estado === 'finalizada')
    t = { icone: 'bandeira', titulo: 'Partida encerrada', texto: 'O ranking final está congelado. Obrigado por jogar!', status: verificacao };
  else if (!partida || partida.estado === 'rascunho')
    t = { icone: 'relogio', titulo: 'A partida ainda não começou', texto: 'Os organizadores estão preparando os pontos. O radar aparece sozinho quando abrirem.', status: verificacao };
  else
    t = {
      icone: 'local',
      titulo: semPontos ? 'Nenhum ponto ativo' : 'Sem pistas',
      texto: 'Os organizadores ainda não liberaram pontos nesta partida. Fique por perto: o radar aparece sozinho.',
      status: verificacao,
    };

  return (
    <section className="flex grow flex-col items-center justify-center gap-4 py-10 text-center" data-testid="estado-vazio">
      <span className="flex size-20 items-center justify-center rounded-full bg-painel text-suave">
        <Icone nome={t.icone} tamanho={36} />
      </span>
      <h2 className="m-0 font-display text-3xl font-bold">{t.titulo}</h2>
      <p className="m-0 max-w-xs text-base leading-relaxed text-suave">{t.texto}</p>
      <p className="m-0 text-sm text-fraco">{t.status}</p>
      <BotaoSecundario className="mt-4 max-w-xs" onClick={irParaRanking}>
        Ver ranking
      </BotaoSecundario>
    </section>
  );
}
