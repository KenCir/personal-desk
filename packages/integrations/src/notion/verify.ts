import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from '@personal-desk/database/schema';
import { createReadQueries } from '@personal-desk/database/queries';
import { synchronize, type Collection } from './sync';
import { readSnapshot } from './writer';
import type { SourceIds } from './types';

/** The actual collected Notion snapshot is imported twice into a disposable in-memory DB. */
export async function verifyCollection(collection: Collection, ids: SourceIds) {
  const client = new PGlite();
  try {
    const db = drizzle(client, { schema });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../../database/drizzle', import.meta.url)),
    });
    const options = { db, ids, collect: async () => collection, dryRun: false };
    const first = await synchronize(options);
    const before = await readSnapshot(db);
    const second = await synchronize(options);
    const after = await readSnapshot(db);
    const stableIds = (snapshot: typeof before) =>
      Object.fromEntries(
        Object.entries(snapshot).map(([key, rows]) => [
          key,
          rows.map((r: { id: string }) => r.id).sort(),
        ]),
      );
    const stable = JSON.stringify(stableIds(before)) === JSON.stringify(stableIds(after));
    const unchanged =
      second.counts &&
      Object.values(second.counts).every((count) => count.created === 0 && count.updated === 0);
    const reader = createReadQueries(db);
    const projects = await reader.getProjects();
    const now = new Date().toISOString();
    return {
      status:
        first.status === 'success' && second.status === 'success' && stable && unchanged
          ? 'success'
          : 'failed',
      testDatabase: 'disposable PGlite (memory)',
      first,
      second,
      stableInternalIds: stable,
      noDuplicateOrUnnecessaryUpdates: !!unchanged,
      readVerification: {
        projects: projects.length,
        todayTasks: (await reader.getTodayTasks(now)).length,
        milestones: after.milestones.length,
        resources: after.resources.length,
        projectDetails: (
          await Promise.all(projects.map((p) => reader.getProjectBySlug(p.slug)))
        ).filter(Boolean).length,
      },
    };
  } finally {
    await client.close();
  }
}
