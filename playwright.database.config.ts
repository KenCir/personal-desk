import { defineConfig } from '@playwright/test';

// Read-only smoke against an already migrated EMPTY database. Never seeds or migrates it.
export default defineConfig({
  testDir: './tests/database-e2e',
  outputDir: './test-results/database',
  workers: 1,
  use: { channel: 'chrome', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'empty-database',
      testMatch: 'empty.spec.ts',
      use: { baseURL: 'http://127.0.0.1:43101' },
    },
    {
      name: 'failed-database',
      testMatch: 'failure.spec.ts',
      use: { baseURL: 'http://127.0.0.1:43102' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @personal-desk/web start -p 43101',
      url: 'http://127.0.0.1:43101/settings',
      env: { DATA_SOURCE: 'database' },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'pnpm --filter @personal-desk/web start -p 43102',
      url: 'http://127.0.0.1:43102/settings',
      env: {
        DATA_SOURCE: 'database',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/unreachable',
      },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
