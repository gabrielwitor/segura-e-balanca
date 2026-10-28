import { useCallback, useEffect, useState } from 'react';
import { observarUsuario, carregarPerfil, type User } from '@/firebase/conta';
import { CheckIn } from './telas/CheckIn';
import { Entrando } from './telas/Entrando';
import { Instalar } from './telas/Instalar';
import { Jogo } from './telas/Jogo';
import { PermissaoNegada } from './telas/PermissaoNegada';
import { Permissoes } from './telas/Permissoes';
import { Tela } from './telas/Tela';
import { useSessao } from './dados';
import { deveOferecerInstalacao } from './instalacao';
import { pedirLocalizacao } from './sensores';
import { db, iniciarServicos } from './servicos';

type Fase = 'instalar' | 'permissoes' | 'permissao-negada' | 'entrando' | 'jogo';

export function JogadorApp() {
  const [usuario, setUsuario] = useState<User | null | undefined>(undefined);
  const sessao = useSessao();
  const [fase, setFase] = useState<Fase | null>(null);
  const [perfilVerificado, setPerfilVerificado] = useState(false);
  /** Passos do onboarding de quem acabou de criar o apelido (fixo, para a numeração não mudar no meio). */
  const [totalPassos, setTotalPassos] = useState<number | null>(null);
  const [soRanking, setSoRanking] = useState(false);

  useEffect(() => {
    void iniciarServicos();
    return observarUsuario(setUsuario);
  }, []);

  // Saiu da conta: o próximo login começa o fluxo do zero.
  useEffect(() => {
    if (usuario !== null) return;
    setFase(null);
    setTotalPassos(null);
    setSoRanking(false);
  }, [usuario]);

  // RF-03: em outro aparelho, recupera o apelido do servidor antes de decidir a tela.
  useEffect(() => {
    if (!usuario) return;
    setPerfilVerificado(false);
    void (async () => {
      try {
        const local = await db.sessao.get('jogador');
        if (local?.uid === usuario.uid && local.apelido) return;
        const perfil = await carregarPerfil(usuario.uid).catch(() => null);
        if (!perfil) return;
        // A resposta pode chegar depois do check-in deste aparelho: nunca apaga o que já está lá.
        await db.transaction('rw', db.sessao, async () => {
          const atual = await db.sessao.get('jogador');
          if (atual?.uid === usuario.uid && atual.apelido) return;
          await db.sessao.put({ id: 'jogador', uid: usuario.uid, apelido: perfil.apelido, email: usuario.email, partidaId: null });
        });
      } finally {
        setPerfilVerificado(true);
      }
    })();
  }, [usuario]);

  const terminarEntrada = useCallback(() => setFase('jogo'), []);

  if (usuario === undefined || sessao === undefined) return <Tela carregando />;

  const jogador = sessao.jogador?.uid === usuario?.uid ? sessao.jogador : undefined;
  const dentro = !!usuario && !!jogador?.apelido && !!(jogador.partidaId ?? sessao.partida?.id);

  if (!usuario) return <CheckIn usuario={null} aoContinuar={() => {}} />;
  if (!jogador?.apelido) {
    if (!perfilVerificado) return <Tela carregando />;
    return (
      <CheckIn
        usuario={usuario}
        aoContinuar={() => {
          const instalar = deveOferecerInstalacao();
          setTotalPassos(instalar ? 3 : 2);
          setFase(instalar ? 'instalar' : 'permissoes');
        }}
      />
    );
  }

  // RF-32: reabrir (mesmo offline) volta direto ao jogo.
  const atual: Fase = fase ?? (dentro ? 'jogo' : deveOferecerInstalacao() ? 'instalar' : 'permissoes');

  const rotulo = (n: number) => (totalPassos ? `Passo ${n} de ${totalPassos}` : null);

  if (atual === 'instalar') return <Instalar passo={rotulo(2)} aoContinuar={() => setFase('permissoes')} />;

  if (atual === 'permissoes')
    return <Permissoes passo={rotulo(totalPassos ?? 0)} aoContinuar={() => setFase('entrando')} aoNegarLocalizacao={() => setFase('permissao-negada')} />;

  if (atual === 'permissao-negada')
    return (
      <PermissaoNegada
        aoTentar={() => void pedirLocalizacao().then((r) => setFase(r === 'negada' ? 'permissao-negada' : 'entrando'))}
        aoVerRanking={() => {
          setSoRanking(true);
          setFase(dentro ? 'jogo' : 'entrando');
        }}
      />
    );

  if (atual === 'entrando') return <Entrando uid={usuario.uid} aoTerminar={terminarEntrada} aoVoltar={() => setFase('permissoes')} />;

  return <Jogo uid={usuario.uid} apelido={jogador.apelido} abaInicial={soRanking || abaDoAtalho() === 'ranking' ? 'ranking' : 'radar'} />;
}

/** Atalho do ícone instalado ("Ranking", no manifest) abre direto na aba. */
function abaDoAtalho(): string | null {
  return new URLSearchParams(location.search).get('aba');
}
