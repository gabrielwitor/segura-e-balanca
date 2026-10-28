import { useEffect, useState } from 'react';
import { sugerirApelido, validarApelido } from '@/dominio/apelido';
import { ApelidoEmUso, apelidoLivre, entrarComGoogle, reservarApelido, type User } from '@/firebase/conta';
import { Icone, type NomeIcone } from '@/ui/Icone';
import { db } from '../servicos';
import { useConexao } from '../dados';
import { BotaoPrimario, Girando, Tela } from './Tela';

interface Props {
  usuario: User | null;
  aoContinuar: () => void;
}

/** Tela 1 · login (RF-01) e apelido (RF-02, RF-06). */
export function CheckIn({ usuario, aoContinuar }: Props) {
  return usuario ? <Apelido usuario={usuario} aoContinuar={aoContinuar} /> : <Login />;
}

const COMO_JOGAR: [NomeIcone, string, string][] = [
  ['radar', 'Siga o radar', 'bg-frio text-[#A9C8FF]'],
  ['local', 'Chegue na área', 'bg-[#3A2410] text-[#FFB08A]'],
  ['balancar', 'Segure e sacuda', 'bg-[#12301F] text-verde'],
];

function Login() {
  const conexao = useConexao();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const login = async () => {
    setErro(null);
    setOcupado(true);
    try {
      await entrarComGoogle();
    } catch {
      setErro('Não deu para entrar. Confira a internet.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Tela className="gap-7">
      <div className="mt-8 flex flex-col gap-3.5">
        <h1 className="m-0 font-display text-[56px] leading-[0.95] font-bold tracking-tight">
          Segura e <span className="text-verde">Balança</span>
        </h1>
        <p className="m-0 text-lg leading-snug text-[#C6D6CD]">Ache os pontos escondidos pelo campus. Quem balança primeiro leva mais.</p>
      </div>
      <ol aria-label="Como jogar" className="m-0 flex list-none flex-col gap-4 p-0">
        {COMO_JOGAR.map(([icone, texto, cor]) => (
          <li key={texto} className="flex items-center gap-3.5 text-base font-semibold">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cor}`}>
              <Icone nome={icone} tamanho={22} />
            </span>
            {texto}
          </li>
        ))}
      </ol>
      <div className="grow" />
      <BotaoPrimario onClick={() => void login()} disabled={ocupado || conexao === 'sem-rede'} className="bg-white text-[#1f1f1f]">
        {ocupado ? <Girando /> : <GoogleG />}
        Entrar com Google
      </BotaoPrimario>
      {conexao === 'sem-rede' && <p className="-mt-4 mb-0 text-center text-sm text-alerta">Sem internet</p>}
      {erro && (
        <p role="alert" className="m-0 rounded-xl bg-erro-fundo p-3 text-sm text-erro-texto">
          {erro}
        </p>
      )}
    </Tela>
  );
}

type Disponibilidade = { estado: 'vazio' | 'verificando' | 'livre' | 'invalido' | 'em-uso'; msg: string; sugestoes: string[] };

function Apelido({ usuario, aoContinuar }: { usuario: User; aoContinuar: () => void }) {
  const conexao = useConexao();
  const [texto, setTexto] = useState(() => sugerirApelido(usuario.displayName));
  const [disp, setDisp] = useState<Disponibilidade>({ estado: 'vazio', msg: '', sugestoes: [] });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Verifica enquanto digita (com pausa), e sugere alternativas livres se estiver em uso.
  useEffect(() => {
    const invalido = validarApelido(texto);
    if (invalido) {
      setDisp({ estado: texto.trim() ? 'invalido' : 'vazio', msg: texto.trim() ? invalido : '', sugestoes: [] });
      return;
    }
    setDisp((d) => ({ ...d, estado: 'verificando', msg: '' }));
    let cancelado = false;
    const id = setTimeout(async () => {
      const livre = await apelidoLivre(usuario.uid, texto).catch(() => true);
      if (cancelado) return;
      if (livre) return setDisp({ estado: 'livre', msg: 'Disponível', sugestoes: [] });
      const [nome, sobrenome] = (usuario.displayName ?? texto).trim().split(/\s+/);
      const candidatas = [...new Set([sobrenome ? `${texto.trim()} ${sobrenome[0]}.` : '', `${texto.trim()} 2`, nome && nome !== texto.trim() ? nome : ''])]
        .filter((c) => c && !validarApelido(c))
        .slice(0, 3);
      const livres = await Promise.all(candidatas.map((c) => apelidoLivre(usuario.uid, c).catch(() => false)));
      if (!cancelado) setDisp({ estado: 'em-uso', msg: 'Já está em uso.', sugestoes: candidatas.filter((_, i) => livres[i]) });
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(id);
    };
  }, [texto, usuario]);

  const continuar = async () => {
    setErro(null);
    setOcupado(true);
    try {
      const final = await reservarApelido(usuario.uid, texto);
      await db.sessao.put({ id: 'jogador', uid: usuario.uid, apelido: final, email: usuario.email, partidaId: null });
      aoContinuar();
    } catch (e) {
      if (e instanceof ApelidoEmUso) setDisp({ estado: 'em-uso', msg: e.message, sugestoes: [] });
      else setErro(e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const ruim = disp.estado === 'em-uso' || disp.estado === 'invalido';
  const pode = disp.estado === 'livre' && conexao !== 'sem-rede' && !ocupado;

  return (
    <Tela className="gap-6">
      <div className="text-sm font-semibold text-suave">Passo 1 de 3</div>
      <form
        className="flex grow flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (pode) void continuar();
        }}
      >
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[32px] leading-tight font-bold">Como você quer aparecer no ranking?</h1>
          <div className="flex items-center gap-2.5 text-sm text-suave">
            <span className="flex size-7 items-center justify-center rounded-full bg-verde text-[13px] font-bold text-verde-tinta" aria-hidden="true">
              {(usuario.displayName ?? usuario.email ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{usuario.email}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="apelido" className="font-semibold">
            Apelido
          </label>
          <input
            id="apelido"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            aria-describedby="apelido-status"
            aria-invalid={ruim}
            className={`h-14 rounded-[14px] border-2 bg-painel px-4 text-lg text-texto outline-none ${ruim ? 'border-erro' : disp.estado === 'livre' ? 'border-verde' : 'border-borda focus:border-verde'}`}
          />
          <div id="apelido-status" role="status" className={`flex min-h-5 items-center gap-2 text-sm font-semibold ${ruim ? 'text-[#FFB4AD]' : 'text-verde-claro'}`}>
            {disp.estado === 'verificando' && <Girando tamanho={14} />}
            {disp.estado === 'livre' && <Icone nome="check" tamanho={16} strokeWidth={2.4} />}
            {ruim && <Icone nome="alertaCirculo" tamanho={16} />}
            {disp.msg}
          </div>
          {disp.sugestoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {disp.sugestoes.map((s) => (
                <button key={s} type="button" onClick={() => setTexto(s)} className="h-11 rounded-full border border-borda bg-painel px-4 text-[15px]">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="m-0 text-sm leading-snug text-suave">Sua localização só é gravada quando você balança e é apagada 30 dias após a partida.</p>

        <div className="grow" />
        <BotaoPrimario type="submit" disabled={!pode}>
          {ocupado && <Girando />}
          Continuar
        </BotaoPrimario>
        {conexao === 'sem-rede' && <p className="-mt-4 mb-0 text-center text-sm text-alerta">Sem internet</p>}
        {erro && (
          <p role="alert" className="m-0 rounded-xl bg-erro-fundo p-3 text-sm text-erro-texto">
            {erro}
          </p>
        )}
      </form>
    </Tela>
  );
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
