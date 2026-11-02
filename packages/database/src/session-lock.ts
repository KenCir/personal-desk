import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
type LockQuery = Pick<PgDatabase<PgQueryResultHKT, typeof schema>, 'execute'>;

/** One physical session for the lock AND writes. No transaction spans API calls. */
export async function withNotionSession<T>(
  url: string,
  work: (session: {
    db: ReturnType<typeof drizzle<typeof schema>>;
    assertHeld: (tx?: LockQuery) => Promise<void>;
  }) => Promise<T>,
): Promise<T> {
  let lost = false;
  const client = postgres(url, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 0,
    max_lifetime: 0,
    onclose: () => {
      lost = true;
    },
  });
  try {
    // A single-connection private pool keeps Drizzle transactions on the lock session.
    const db = drizzle(client, { schema });
    const result = await db.execute(sql`select pg_try_advisory_lock(168398833, 2) as acquired`);
    if (result[0]?.acquired !== true) throw new Error('notion_sync_busy');
    const assertHeld = async (tx: LockQuery = db) => {
      if (lost) throw new Error('notion_lock_lost');
      const held = await tx.execute(sql`select exists (
        select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()
        and classid = 168398833 and objid = 2 and objsubid = 2 and granted
      ) as held`);
      if (lost || !Array.isArray(held) || held[0]?.held !== true)
        throw new Error('notion_lock_lost');
    };
    return await work({ db, assertHeld });
  } finally {
    // Closing releases the session lock even after errors; never leave it in a shared pool.
    await client.end({ timeout: 5 });
  }
}
