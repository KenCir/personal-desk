// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@personal-desk/database';
import { getDatabaseDataSource } from './database';

vi.mock('server-only', () => ({}));
afterEach(async () => {
  const runtime = globalThis as typeof globalThis & {
    deskDatabase?: ReturnType<typeof createDatabase>;
  };
  await runtime.deskDatabase?.close();
  delete runtime.deskDatabase;
  vi.unstubAllEnvs();
});

it('never substitutes mock events or rows when the database connection fails', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@127.0.0.1:1/unreachable');
  const source = getDatabaseDataSource();
  expect(source.calendarStatus).toBe('disconnected');
  expect(await source.getEvents('2026-10-30T00:00:00Z')).toEqual([]);
  await expect(source.getProjects()).rejects.toThrow();
  await expect(source.getInfrastructure()).rejects.toThrow();
}, 15000);

it('rejects missing database configuration without constructing a mock source', () => {
  vi.stubEnv('DATABASE_URL', '');
  expect(() => getDatabaseDataSource()).toThrow('DATABASE_URL');
});
