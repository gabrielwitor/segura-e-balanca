import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';

/** Versão visível no app (ajustes): commit + data do build, para saber se o celular está atualizado. */
function versao(): string {
  let commit = 'local';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* fora de um repositório git */
  }
  const d = new Date();
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return `${commit} · ${dia} ${hora}`;
}

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(versao()) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Seção 15.5: nunca trocar o SW por baixo do jogador; mostrar "nova versão disponível".
      registerType: 'prompt',
      includeAssets: ['icone.svg'],
      manifest: {
        name: 'Segura e Balança',
        short_name: 'Segura e Balança',
        description: 'Gincana de campus: ache o ponto pelo radar e balance o celular.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B1410',
        theme_color: '#0B1410',
        icons: [
          { src: 'icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fontes', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
});
