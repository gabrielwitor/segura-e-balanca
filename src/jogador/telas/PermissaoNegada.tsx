import { Icone } from '@/ui/Icone';
import { BotaoPrimario, BotaoSecundario, Tela } from './Tela';

const ehIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Tela 8 · Erro: localização negada, com o caminho de cada plataforma. */
export function PermissaoNegada({ aoTentar, aoVerRanking }: { aoTentar: () => void; aoVerRanking: () => void }) {
  const guia = ehIos()
    ? {
        titulo: 'No iPhone (Safari)',
        passos: [
          ['Abra Ajustes', 'Privacidade', 'Serviços de Localização.'],
          ['Ative e escolha Safari (ou o app instalado)', 'Durante o Uso.'],
          ['Volte aqui e toque em Tentar de novo.'],
        ],
      }
    : {
        titulo: 'No Android (Chrome)',
        passos: [['Toque no cadeado ao lado do endereço.'], ['Abra Permissões', 'Localização.'], ['Escolha Permitir e volte aqui.']],
      };
  return (
    <Tela className="gap-6">
      <div className="mt-8 flex size-16 items-center justify-center rounded-2xl bg-erro-fundo text-erro">
        <Icone nome="local" tamanho={32} />
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="m-0 font-display text-3xl font-bold leading-tight">Sem localização, o radar não funciona</h1>
        <p className="m-0 text-base leading-relaxed text-suave">
          O acesso à localização foi negado. Ela só é usada para medir a distância até os pontos e é gravada apenas no momento em que você balança.
        </p>
      </div>
      <section className="flex flex-col gap-3 rounded-2xl border border-borda bg-painel p-4">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-widest text-suave">{guia.titulo}</h2>
        <ol className="m-0 flex flex-col gap-3 pl-5">
          {guia.passos.map((partes, i) => (
            <li key={i} className="leading-snug">
              {partes.join(' › ')}
            </li>
          ))}
        </ol>
      </section>
      <div className="grow" />
      <div className="flex flex-col gap-3">
        <BotaoPrimario onClick={aoTentar}>Tentar de novo</BotaoPrimario>
        <BotaoSecundario onClick={aoVerRanking}>Ver só o ranking</BotaoSecundario>
      </div>
    </Tela>
  );
}
