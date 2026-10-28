/** Instalação da PWA: plataforma, se já está instalada e o convite nativo do Android. */

interface EventoDeInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let convite: EventoDeInstalacao | null = null;
const ouvintes = new Set<() => void>();

// Precisa ouvir cedo: o Chrome dispara uma vez, logo depois de carregar.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    convite = e as EventoDeInstalacao;
    ouvintes.forEach((cb) => cb());
  });
  window.addEventListener('appinstalled', () => {
    convite = null;
    ouvintes.forEach((cb) => cb());
  });
}

export type Plataforma = 'iphone' | 'android' | 'navegador-de-app' | 'outro';

/** Navegadores embutidos (Instagram, Facebook, TikTok, WebView do Android): não instalam e falham nos sensores. */
const NAVEGADOR_DE_APP = /Instagram|FBAN|FBAV|FB_IAB|Line\/|Twitter|TikTok|Snapchat|musical_ly|; wv\)/i;

export function plataforma(ua = navigator.userAgent): Plataforma {
  if (NAVEGADOR_DE_APP.test(ua)) return 'navegador-de-app';
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return 'outro';
}

export function estaInstalado(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const conviteNativo = {
  disponivel: () => convite != null,
  inscrever(cb: () => void) {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  },
  /** Abre o diálogo do Chrome. Devolve true se a pessoa instalou. */
  async abrir(): Promise<boolean> {
    if (!convite) return false;
    await convite.prompt();
    const { outcome } = await convite.userChoice;
    convite = null;
    ouvintes.forEach((cb) => cb());
    return outcome === 'accepted';
  },
};

const PULOU = 'seb:instalar-pulado';

export const pulouInstalacao = {
  ler(): boolean {
    try {
      return localStorage.getItem(PULOU) === '1';
    } catch {
      return false;
    }
  },
  marcar() {
    try {
      localStorage.setItem(PULOU, '1');
    } catch {
      /* sem armazenamento: pergunta de novo na próxima */
    }
  },
};

/** Mostrar o passo de instalação no onboarding? */
export function deveOferecerInstalacao(): boolean {
  if (estaInstalado() || pulouInstalacao.ler()) return false;
  const p = plataforma();
  return p !== 'outro' || conviteNativo.disponivel();
}

const DICAS = 'seb:dicas-vistas';

export const dicasVistas = {
  ler(): boolean {
    try {
      return localStorage.getItem(DICAS) === '1';
    } catch {
      return true;
    }
  },
  marcar() {
    try {
      localStorage.setItem(DICAS, '1');
    } catch {
      /* ok */
    }
  },
};
