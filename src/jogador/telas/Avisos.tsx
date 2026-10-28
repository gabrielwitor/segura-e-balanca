import { useEffect, useRef, useState } from 'react';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { useConexao, type DadosDoJogo } from '../dados';
import { feedback } from '../feedback';

interface Aviso {
  id: number;
  icone: NomeIcone;
  forte: string;
  resto?: string;
  tom: 'claro' | 'alerta' | 'neutro';
}

const TOM = {
  claro: 'bg-texto text-noite',
  alerta: 'border border-alerta-borda bg-alerta-fundo text-[#FFE6B0]',
  neutro: 'border border-borda bg-painel text-texto',
} as const;

const DURACAO_MS = 4000;

/** Avisos curtos no rodapé, acima do botão de balançar (nunca por cima dele). */
export function Avisos({ dados }: { dados: DadosDoJogo }) {
  const conexao = useConexao();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const seq = useRef(0);
  const mostrar = (a: Omit<Aviso, 'id'>) => setAviso({ ...a, id: ++seq.current });

  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), DURACAO_MS);
    return () => clearTimeout(id);
  }, [aviso]);

  // Conexão: caiu, e voltou depois de acumular pendências.
  const anterior = useRef(conexao);
  const pendentesOffline = useRef(0);
  const pendentes = dados.pendentes;
  useEffect(() => {
    if (conexao !== 'online') pendentesOffline.current = Math.max(pendentesOffline.current, pendentes);
    if (anterior.current === 'online' && conexao === 'sem-rede') mostrar({ icone: 'semRede', forte: 'Sem internet.', resto: 'O jogo continua.', tom: 'alerta' });
    anterior.current = conexao;
    if (conexao === 'online' && pendentes === 0 && pendentesOffline.current > 0) {
      const n = pendentesOffline.current;
      pendentesOffline.current = 0;
      feedback.sincronizou();
      mostrar({ icone: 'check', forte: 'Online.', resto: `${n} ${n === 1 ? 'balançada enviada' : 'balançadas enviadas'}.`, tom: 'claro' });
    }
  }, [conexao, pendentes]);

  // Partida pausada/retomada e pontos novos, vistos no sync.
  const estado = dados.partida?.estado;
  const estadoAntes = useRef(estado);
  useEffect(() => {
    if (estadoAntes.current === 'ativa' && estado === 'pausada') mostrar({ icone: 'pausa', forte: 'Partida pausada', tom: 'neutro' });
    if (estadoAntes.current === 'pausada' && estado === 'ativa') mostrar({ icone: 'play', forte: 'Partida retomada', tom: 'neutro' });
    estadoAntes.current = estado;
  }, [estado]);

  const ativos = dados.pontos.filter((p) => p.ativo);
  const chaveAtivos = ativos.map((p) => p.id).sort().join(',');
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const atuais = new Set(chaveAtivos ? chaveAtivos.split(',') : []);
    if (vistos.current) {
      const nova = ativos.find((p) => !vistos.current!.has(p.id));
      if (nova) mostrar({ icone: 'criarAqui', forte: `Ponto ${nova.numero} liberado`, tom: 'neutro' });
    }
    vistos.current = atuais;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveAtivos]);

  if (!aviso) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[184px] z-40 flex justify-center px-4">
      <div
        key={aviso.id}
        role="status"
        className={`animate-acende flex w-full max-w-[408px] items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${TOM[aviso.tom]}`}
      >
        <Icone nome={aviso.icone} tamanho={22} className="shrink-0" />
        <span className="text-[15px] leading-snug">
          <strong>{aviso.forte}</strong>
          {aviso.resto && ` ${aviso.resto}`}
        </span>
      </div>
    </div>
  );
}
