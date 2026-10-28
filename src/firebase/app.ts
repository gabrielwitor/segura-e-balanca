import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore';

const env = import.meta.env;
export const emEmulador = env.VITE_EMULADOR === '1';

const app = initializeApp({
  apiKey: env.VITE_FB_API_KEY,
  authDomain: env.VITE_FB_AUTH_DOMAIN,
  projectId: env.VITE_FB_PROJECT_ID,
  appId: env.VITE_FB_APP_ID,
});

export const auth = getAuth(app);
auth.languageCode = 'pt-BR';

/**
 * Seção 5.2: cache em memória. O cache persistente e a fila de envio são nossos
 * (src/sync), para que armazenamento e sync sejam inspecionáveis e demonstráveis.
 */
export const firestore = initializeFirestore(app, { localCache: memoryLocalCache() });

if (emEmulador) {
  const host = env.VITE_EMULADOR_HOST ?? location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(firestore, host, 8085);
}
