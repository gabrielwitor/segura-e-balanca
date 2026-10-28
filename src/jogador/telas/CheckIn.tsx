import { useState } from 'react';
import { sugerirApelido, validarApelido } from '@/dominio/apelido';
import { ApelidoEmUso, entrarComGoogle, reservarApelido, type User } from '@/firebase/conta';
import { db } from '../servicos';
import { useConexao } from '../dados';
import { pedirPermissoes } from '../sensores';
import { destravarSom } from '../feedback';
import { BotaoPrimario, Girando, Logo, Tela } from './Tela';

interface Props {
  usuario: User | null;
  apelido: string | undefined;
  aoEntrar: () => void;
  aoNegarLocalizacao: () => void;
}

/** Tela 1 · Login e apelido (RF-01, RF-02, RF-05, RF-06). */
export function CheckIn({ usuario, apelido, aoEntrar, aoNegarLocalizacao }: Props) {
  const conexao = useConexao();
  // Com "servidor indisponível" deixamos tentar: a própria operação diz se falhou.
  const online = conexao !== 'sem-rede';
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [texto, setTexto] = useState(() => sugerirApelido(usuario?.displayName));

  const login = async () => {
    setErro(null);
    setOcupado(true);
    try {
      await entrarComGoogle();
    } catch {
      setErro('Não deu para entrar com o Google. Confira a internet e tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const entrar = async () => {
    if (!usuario) return;
    destravarSom();
    setErro(null);
    setOcupado(true);
    try {
      if (!apelido) {
        const invalido = validarApelido(texto);
        if (invalido) throw new Error(invalido);
        const final = await reservarApelido(usuario.uid, texto);
        await db.sessao.put({ id: 'jogador', uid: usuario.uid, apelido: final, email: usuario.email, partidaId: null });
      }
      const p = await pedirPermissoes();
      if (p === 'localizacao-negada') aoNegarLocalizacao();
      else aoEntrar();
    } catch (e) {
      setErro(e instanceof ApelidoEmUso ? e.message : e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Tela className="gap-6">
      <div className="mt-6 flex flex-col gap-4">
        <Logo grande />
        <p className="m-0 text-lg leading-snug text-suave">Ache os pontos escondidos pelo campus. Quem balança primeiro leva mais.</p>
      </div>

      <div className="grow" />

      {!usuario ? (
        <div className="flex flex-col gap-3">
          <BotaoPrimario onClick={() => void login()} disabled={ocupado || !online} className="bg-white text-[#1f1f1f]">
            {ocupado ? <Girando /> : <GoogleG />}
            Entrar com Google
          </BotaoPrimario>
          <p className="m-0 text-center text-sm text-suave">Use a mesma conta em qualquer celular para continuar de onde parou.</p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void entrar();
          }}
        >
          <div className="flex items-center gap-3 rounded-2xl border border-borda bg-painel px-4 py-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-verde font-bold text-verde-tinta" aria-hidden="true">
              {(usuario.displayName ?? usuario.email ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate text-sm text-suave">{usuario.email}</span>
          </div>

          {apelido ? (
            <p className="m-0 text-lg">
              Você joga como <strong className="font-display">{apelido}</strong>.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="apelido" className="font-semibold">
                Seu apelido no ranking
              </label>
              <input
                id="apelido"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={20}
                autoComplete="nickname"
                aria-describedby="apelido-ajuda"
                className="h-14 rounded-2xl border-2 border-borda bg-painel px-4 text-lg text-texto outline-none focus:border-verde"
              />
              <span id="apelido-ajuda" className="text-sm text-suave">
                Precisa ser único. Você escolhe só uma vez.
              </span>
            </div>
          )}

          <p className="m-0 rounded-2xl bg-painel p-4 text-sm leading-relaxed text-suave">
            Guardamos sua localização só no momento em que você balança, e ela é apagada 30 dias depois do fim da partida.
          </p>

          <BotaoPrimario type="submit" disabled={ocupado || !online}>
            {ocupado && <Girando />}
            Entrar na partida e permitir sensores
          </BotaoPrimario>
          <p className={`m-0 text-center text-sm ${online ? 'text-suave' : 'text-alerta'}`}>
            {online ? 'Online · a entrada precisa de internet' : 'Sem internet · a entrada precisa de conexão'}
          </p>
        </form>
      )}

      {erro && (
        <p role="alert" className="m-0 rounded-xl bg-erro-fundo p-3 text-sm text-erro-texto">
          {erro}
        </p>
      )}
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
