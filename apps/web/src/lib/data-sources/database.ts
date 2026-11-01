import 'server-only';
import { createDatabase } from '@personal-desk/database';
import { createReadQueries } from '@personal-desk/database/queries';
import type { DeskDataSource } from '@personal-desk/core';
import { databaseUrl } from './config';

// Reuse the existing connection factory and pool, including across Next development reloads.
const runtime = globalThis as typeof globalThis & {
  deskDatabase?: ReturnType<typeof createDatabase>;
};
export function getDatabaseDataSource(): DeskDataSource {
  const url = databaseUrl(process.env.DATABASE_URL);
  runtime.deskDatabase ??= createDatabase(url);
  return {
    ...createReadQueries(runtime.deskDatabase.db),
    calendarStatus: 'disconnected',
    getEvents: async () => [],
  };
}
