import { useEffect, useRef, useState } from 'react';
import { Icone } from '@/ui/Icone';
import { useConexao } from '../dados';
import { entrarNaPartida, ligarEscuta, type EtapaEntrada } from '../servicos';
import { BotaoSecundario, Girando, Tela } from './Tela';

const ordem: EtapaEntrada[] = ['conta', 'relogio', 'pontos', 'guardando', 'pronto'];
const TENTAR_DE_NOVO_S = 8;

/** Tela 4 · preparando a partida (RF-04). Tenta de novo sozinha se a conexão cair. */
export function Entrando({ uid, aoTerminar, aoVoltar }: { uid: string; aoTerminar: () => void; aoVoltar: () => void }) {
  const conexao = useConexao();
  const [etapa, setEtapa] = useState<EtapaEntrada>('relogio');
  const [info, setInfo] = useState('');
  const [problema, setProblema] = useState<'sem-partida' | 'falhou' | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [espera, setEspera] = useState(0);
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
        setEspera(TENTAR_DE_NOVO_S);
      })
      .finally(() => {
        rodando.current = false;
      });
  }, [uid, conexao, tentativa, aoTerminar]);

  // Contagem regressiva da nova tentativa automática.
  useEffect(() => {
    if (problema !== 'falhou') return;
    if (espera <= 0) {
      setTentativa((n) => n + 1);
      return;
    }
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [problema, espera]);

  const passos: { id: EtapaEntrada; texto: string }[] = [
    { id: 'conta', texto: 'Conta conectada' },
    { id: 'relogio', texto: 'Relógio acertado' },
    { id: 'pontos', texto: info ? `Pontos baixados · ${info}` : 'Baixando pontos' },
    { id: 'guardando', texto: 'Guardando no celular' },
  ];
  const idx = ordem.indexOf(etapa);
  const pct = Math.round((Math.max(idx, 1) / (ordem.length - 1)) * 100);
  const falhou = problema === 'falhou' || conexao === 'sem-rede';

  return (
    <Tela className="gap-7">
      <h1 className="mt-10 mb-0 font-display text-4xl leading-tight font-bold">Preparando a partida</h1>
      <div
        role="progressbar"
        aria-label="Progresso"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 overflow-hidden rounded-full bg-[#1A2B23]"
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${falhou ? 'bg-alerta' : 'bg-verde'}`} style={{ width: `${pct}%` }} />
      </div>
      <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-live="polite">
        {passos.map((p, i) => {
          const feito = i < idx || p.id === 'conta';
          const atual = !feito && i === idx;
          return (
            <li key={p.id} className={`flex items-center gap-3.5 text-base font-semibold ${feito || atual ? 'text-texto' : 'text-fraco'}`}>
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${
                  feito ? 'border-verde bg-verde text-verde-tinta' : atual && falhou ? 'border-alerta bg-morno text-morno-texto' : atual ? 'border-verde text-verde' : 'border-borda'
                }`}
              >
                {feito ? <Icone nome="check" tamanho={16} strokeWidth={2.6} /> : atual && falhou ? <Icone nome="alertaCirculo" tamanho={16} /> : atual ? <Girando tamanho={16} /> : null}
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
            Nenhuma partida aberta ainda.
          </p>
          <BotaoSecundario onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</BotaoSecundario>
          <BotaoSecundario onClick={aoVoltar}>Voltar</BotaoSecundario>
        </div>
      ) : falhou ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="m-0 rounded-2xl border border-alerta-borda bg-alerta-fundo px-4 py-3.5 text-[15px] text-[#FFE6B0]">
            {conexao === 'sem-rede' ? 'Sem internet. Continuamos quando voltar.' : `Conexão caiu. Tentando de novo em ${espera} s.`}
          </p>
          {conexao !== 'sem-rede' && <BotaoSecundario onClick={() => setEspera(0)}>Tentar agora</BotaoSecundario>}
        </div>
      ) : null}
    </Tela>
  );
}
