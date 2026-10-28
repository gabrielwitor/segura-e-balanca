import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/ui/Icone';
import { useConexao } from '../dados';
import { entrarNaPartida, ligarEscuta, type EtapaEntrada } from '../servicos';
import { BotaoSecundario, Girando, Tela } from './Tela';

const ordem: EtapaEntrada[] = ['conta', 'relogio', 'pontos', 'guardando', 'pronto'];

/** Tela 6 · Carregando a partida (RF-04). Tenta de novo sozinha se a conexão cair. */
export function Entrando({ uid, aoTerminar, aoVoltar }: { uid: string; aoTerminar: () => void; aoVoltar: () => void }) {
  const conexao = useConexao();
  const [etapa, setEtapa] = useState<EtapaEntrada>('conta');
  const [info, setInfo] = useState('');
  const [problema, setProblema] = useState<'sem-partida' | 'falhou' | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const rodando = useRef(false);

  useEffect(() => {
    if (conexao === 'sem-rede' || rodando.current) return;
    rodando.current = true;
    setProblema(null);
    entrarNaPartida(uid, (e, i) => {
      setEtapa(e);
      if (i) setInfo(i);
    })
      .then((r) => {
        if (r === 'sem-partida') setProblema('sem-partida');
        else {
          ligarEscuta(uid);
          aoTerminar();
        }
      })
      .catch(() => {
        setProblema('falhou');
        setTimeout(() => setTentativa((n) => n + 1), 3000);
      })
      .finally(() => {
        rodando.current = false;
      });
  }, [uid, conexao, tentativa, aoTerminar]);

  const passos: { id: EtapaEntrada; texto: string }[] = [
    { id: 'conta', texto: 'Conta Google conectada' },
    { id: 'relogio', texto: 'Relógio sincronizado com o servidor' },
    { id: 'pontos', texto: info ? `Pontos baixados · ${info}` : 'Baixando os pontos' },
    { id: 'guardando', texto: 'Guardando no celular para jogar offline' },
  ];
  const idx = ordem.indexOf(etapa);

  return (
    <Tela className="gap-8">
      <div className="mt-10 flex flex-col gap-3">
        <h1 className="m-0 font-display text-4xl font-bold">Preparando a partida</h1>
        <p className="m-0 text-lg text-suave">Depois disso o jogo funciona mesmo sem internet.</p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-live="polite">
        {passos.map((p, i) => {
          const feito = i < idx || (p.id === 'conta' && idx >= 0);
          const atual = !feito && i === idx;
          return (
            <li key={p.id} className={`flex items-center gap-3 text-base ${feito ? 'text-texto' : atual ? 'text-texto' : 'text-fraco'}`}>
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${feito ? 'bg-verde text-verde-tinta' : 'border-2 border-borda'}`}
              >
                {feito ? <Icone nome="check" tamanho={16} strokeWidth={3} /> : atual ? <Girando tamanho={16} /> : null}
              </span>
              {p.texto}
            </li>
          );
        })}
      </ol>
      <div className="grow" />
      {problema === 'sem-partida' ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="m-0 rounded-2xl bg-painel p-4 text-suave">
            Ainda não há partida aberta. Fale com os organizadores e tente de novo.
          </p>
          <BotaoSecundario onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</BotaoSecundario>
          <BotaoSecundario onClick={aoVoltar}>Voltar</BotaoSecundario>
        </div>
      ) : (
        <p className={`m-0 text-center text-sm ${problema || conexao === 'sem-rede' ? 'text-alerta' : 'text-suave'}`} role="status">
          {conexao === 'sem-rede'
            ? 'Sem conexão. Assim que voltar, continuamos sozinhos.'
            : problema
              ? 'A conexão falhou. Tentando de novo…'
              : 'Não feche o app até terminar. Se a conexão cair, tentamos de novo sozinhos.'}
        </p>
      )}
    </Tela>
  );
}
