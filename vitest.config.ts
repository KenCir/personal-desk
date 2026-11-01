import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      'next/navigation': path('./tests/navigation.ts'),
      '@personal-desk/core': path('./packages/core/src/index.ts'),
      '@personal-desk/i18n': path('./packages/i18n/src/index.ts'),
      '@': path('./apps/web/src'),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
