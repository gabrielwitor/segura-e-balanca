import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node', setupFiles: ['fake-indexeddb/auto'] },
      },
      {
        resolve: { alias },
        test: { name: 'rules', include: ['tests/rules/**/*.test.ts'], environment: 'node', testTimeout: 20000 },
      },
    ],
  },
});
