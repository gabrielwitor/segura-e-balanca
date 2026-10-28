import { defineConfig, devices } from '@playwright/test';

/**
 * Seção 15.2: cenários do enunciado contra o build e o Emulator.
 * Rodar com: npx firebase emulators:exec --only firestore,auth --project demo-seb "npm run test:e2e"
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    video: process.env.CI ? 'on' : 'retain-on-failure',
    permissions: ['geolocation'],
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    // O WebKit do Playwright não é o Safari do iPhone: sensores no iOS real seguem manuais.
    { name: 'iphone-14', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
