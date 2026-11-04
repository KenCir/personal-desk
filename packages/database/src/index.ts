import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
export { withNotionSession } from './session-lock';
// Explicit construction keeps imports safe when the mock application has no database.
export function createDatabase(url: string) {
  const client = postgres(url, { max: 5, connect_timeout: 5, idle_timeout: 20 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
    // Uses the same pool. Statement timeout bounds DB work, not just the HTTP response.
    ready: () =>
      client.begin('read only', async (tx) => {
        await tx`set local statement_timeout = '2000ms'`;
        await tx`select id from projects limit 0`;
        await tx`select dedup_key from activities limit 0`;
        await tx`select scope from integration_cursors limit 0`;
        await tx`select 'waiting'::task_status`;
      }),
  };
}
