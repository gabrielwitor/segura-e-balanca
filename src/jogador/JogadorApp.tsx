import { useEffect, useState } from 'react';
import { observarUsuario, carregarPerfil, type User } from '@/firebase/conta';
import { CheckIn } from './telas/CheckIn';
import { Entrando } from './telas/Entrando';
import { Jogo } from './telas/Jogo';
import { PermissaoNegada } from './telas/PermissaoNegada';
import { Tela } from './telas/Tela';
import { useSessao } from './dados';
import { db, iniciarServicos } from './servicos';

type Fase = 'checkin' | 'entrando' | 'permissao' | 'jogo';

export function JogadorApp() {
  const [usuario, setUsuario] = useState<User | null | undefined>(undefined);
  const sessao = useSessao();
  const [fase, setFase] = useState<Fase | null>(null);
  const [soRanking, setSoRanking] = useState(false);

  useEffect(() => {
    void iniciarServicos();
    return observarUsuario(setUsuario);
  }, []);

  // RF-03: em outro aparelho, recupera o apelido do servidor.
  useEffect(() => {
    if (!usuario) return;
    void (async () => {
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
    })();
  }, [usuario]);

  if (usuario === undefined || sessao === undefined) return <Tela carregando />;

  const jogador = sessao.jogador?.uid === usuario?.uid ? sessao.jogador : undefined;
  const dentro = !!usuario && !!jogador?.apelido && !!(jogador.partidaId ?? sessao.partida?.id);

  // RF-32: reabrir (mesmo offline) volta direto ao jogo.
  const atual: Fase = fase ?? (dentro ? 'jogo' : 'checkin');

  if (!usuario || atual === 'checkin' || !jogador?.apelido)
    return <CheckIn usuario={usuario} apelido={jogador?.apelido} aoEntrar={() => setFase('entrando')} aoNegarLocalizacao={() => setFase('permissao')} />;

  if (atual === 'permissao')
    return (
      <PermissaoNegada
        aoTentar={() => setFase('entrando')}
        aoVerRanking={() => {
          setSoRanking(true);
          setFase(dentro ? 'jogo' : 'entrando');
        }}
      />
    );

  if (atual === 'entrando') return <Entrando uid={usuario.uid} aoTerminar={() => setFase('jogo')} aoVoltar={() => setFase('checkin')} />;

  return <Jogo uid={usuario.uid} apelido={jogador.apelido} abaInicial={soRanking ? 'ranking' : 'radar'} />;
}
