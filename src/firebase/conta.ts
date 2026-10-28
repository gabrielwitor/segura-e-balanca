import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { getDoc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { limparApelido, normalizarApelido, validarApelido } from '@/dominio/apelido';
import { auth, emEmulador, firestore } from './app';
import { ref } from './remoto';

export type { User };

export function observarUsuario(cb: (u: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

/** RF-01: popup; se o navegador bloquear, redirect. */
export async function entrarComGoogle(): Promise<void> {
  const provedor = new GoogleAuthProvider();
  provedor.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provedor);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provedor);
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      throw err;
    }
  }
}

/** Só no Emulator: login sem popup, para o Playwright e para testar dois "aparelhos". */
export async function entrarComContaDeTeste(sub: string, nome: string, email: string): Promise<void> {
  if (!emEmulador) throw new Error('Só disponível no emulador');
  const token = JSON.stringify({ sub, email, name: nome, email_verified: true });
  await signInWithCredential(auth, GoogleAuthProvider.credential(token));
}

export const sair = () => signOut(auth);

export interface Perfil {
  apelido: string;
}

/** null = ainda não escolheu apelido. Lança se não houver rede (o chamador decide). */
export async function carregarPerfil(uid: string): Promise<Perfil | null> {
  const s = await getDocFromServer(ref.jogador(uid));
  return s.exists() ? { apelido: s.get('apelido') as string } : null;
}

export class ApelidoEmUso extends Error {}

/** RF-02: livre se ninguém reservou o normalizado, ou se a reserva é deste jogador. */
export async function apelidoLivre(uid: string, apelido: string): Promise<boolean> {
  const s = await getDocFromServer(ref.apelido(normalizarApelido(limparApelido(apelido))));
  return !s.exists() || s.get('uid') === uid;
}

/** RF-02: reserva o apelido normalizado e cria o jogador numa transação. */
export async function reservarApelido(uid: string, apelido: string): Promise<string> {
  const erro = validarApelido(apelido);
  if (erro) throw new Error(erro);
  const limpo = limparApelido(apelido);
  const chave = normalizarApelido(limpo);
  return runTransaction(firestore, async (tx) => {
    const atual = await tx.get(ref.apelido(chave));
    if (atual.exists() && atual.get('uid') !== uid) throw new ApelidoEmUso('Esse apelido já está em uso.');
    const jogador = await tx.get(ref.jogador(uid));
    // Outro aparelho já escolheu (RF-03): vale o que está lá.
    if (jogador.exists()) return jogador.get('apelido') as string;
    tx.set(ref.apelido(chave), { uid, apelido: limpo });
    tx.set(ref.jogador(uid), { apelido: limpo, apelidoNormalizado: chave, criadoEm: serverTimestamp(), partidas: [] });
    return limpo;
  });
}

/** RF-50: admin = existe `admins/{uid}`. */
export async function ehAdmin(uid: string): Promise<boolean> {
  try {
    return (await getDoc(ref.admin(uid))).exists();
  } catch {
    return false;
  }
}

// Ganchos para o Playwright (só em build de emulador).
if (emEmulador) (window as unknown as { __seb: object }).__seb = { entrar: entrarComContaDeTeste };
