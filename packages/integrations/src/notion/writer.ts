import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransactionConfig } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { createHash } from 'node:crypto';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { fileURLToPath } from 'node:url';
import * as s from '@personal-desk/database/schema';
import { NotionSyncError, type NormalizedBatch, type SourceIds } from './types';
import { planSync, type Plan, type Snapshot } from './plan';

export type WriteTransaction = Pick<
  PgDatabase<PgQueryResultHKT, typeof s>,
  'select' | 'insert' | 'update' | 'execute'
>;
export interface SyncDatabase extends WriteTransaction {
  transaction<T>(
    callback: (tx: WriteTransaction) => Promise<T>,
    config?: PgTransactionConfig,
  ): Promise<T>;
}
function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows))
    return result.rows;
  throw new NotionSyncError('invalid_database_result');
}
export async function preflight(db: SyncDatabase, expectedDatabase?: string) {
  return db.transaction(
    async (tx) => {
      const identity = rows(await tx.execute(sql`select current_database() as database`))[0];
      if (expectedDatabase && identity.database !== expectedDatabase)
        throw new NotionSyncError('database_identity_mismatch');
      const statuses = rows(
        await tx.execute(
          sql`select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid join pg_namespace on pg_type.typnamespace = pg_namespace.oid where typname = 'task_status' and nspname = 'public' order by enumsortorder`,
        ),
      ).map((r) => String(r.enumlabel));
      const exists = rows(
        await tx.execute(sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`),
      )[0]?.name;
      const migrations = exists
        ? rows(
            await tx.execute(
              sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`,
            ),
          ).map((r) => ({ hash: String(r.hash), createdAt: String(r.created_at) }))
        : [];
      const expected = readMigrationFiles({
        migrationsFolder: fileURLToPath(new URL('../../../database/drizzle', import.meta.url)),
      });
      const pending = expected
        .filter(
          (entry) =>
            !migrations.some(
              (applied) =>
                applied.hash === entry.hash && applied.createdAt === String(entry.folderMillis),
            ),
        )
        .map((entry) => ({ hash: entry.hash, createdAt: String(entry.folderMillis) }));
      return {
        database: String(identity.database),
        taskStatuses: statuses,
        migrations,
        pending,
        ready: statuses.includes('waiting') && pending.length === 0,
      };
    },
    { accessMode: 'read only' },
  );
}
export async function readSnapshot(tx: WriteTransaction): Promise<Snapshot> {
  const [areas, projects, tasks, milestones, resources] = await Promise.all([
    tx.select().from(s.areas),
    tx.select().from(s.projects),
    tx.select().from(s.tasks).where(eq(s.tasks.provider, 'notion')),
    tx.select().from(s.milestones).where(eq(s.milestones.provider, 'notion')),
    tx.select().from(s.resources).where(eq(s.resources.provider, 'github')),
  ]);
  return { areas, projects, tasks, milestones, resources };
}
async function lock(tx: WriteTransaction) {
  const acquired = rows(
    await tx.execute(sql`select pg_try_advisory_xact_lock(168398833, 1) as acquired`),
  )[0]?.acquired;
  if (acquired !== true) throw new NotionSyncError('notion_sync_busy');
}
export async function previewPlan(db: SyncDatabase, batch: NormalizedBatch, now: string) {
  return db.transaction(async (tx) => planSync(batch, await readSnapshot(tx), now), {
    accessMode: 'read only',
    isolationLevel: 'repeatable read',
  });
}
export async function applyPlan(tx: WriteTransaction, plan: Plan) {
  // Every write is constrained by provider/external_id uniqueness and the planned stable ID.
  // A concurrent non-cooperating writer cannot silently replace an entity's ID or ownership.
  for (const item of plan.areas) {
    const { id, ...values } = item.values;
    const result = await tx
      .insert(s.areas)
      .values(item.values)
      .onConflictDoUpdate({
        target: [s.areas.provider, s.areas.externalId],
        set:
          item.action === 'refresh'
            ? {
                syncedAt: values.syncedAt,
                sourceUpdatedAt: values.sourceUpdatedAt,
                updatedAt: values.updatedAt,
              }
            : values,
        setWhere: and(eq(s.areas.id, id), isNull(s.areas.deletedAt)),
      })
      .returning({ id: s.areas.id });
    if (result[0]?.id !== id) throw new NotionSyncError('concurrent_entity_change');
  }
  for (const item of plan.projects) {
    const { id, ...values } = item.values;
    const result = await tx
      .insert(s.projects)
      .values(item.values)
      .onConflictDoUpdate({
        target: [s.projects.provider, s.projects.externalId],
        set:
          item.action === 'refresh'
            ? {
                syncedAt: values.syncedAt,
                sourceUpdatedAt: values.sourceUpdatedAt,
                updatedAt: values.updatedAt,
              }
            : values,
        setWhere: and(eq(s.projects.id, id), isNull(s.projects.deletedAt)),
      })
      .returning({ id: s.projects.id });
    if (result[0]?.id !== id) throw new NotionSyncError('concurrent_entity_change');
  }
  for (const item of plan.tasks) {
    const { id, ...values } = item.values;
    const result = await tx
      .insert(s.tasks)
      .values(item.values)
      .onConflictDoUpdate({
        target: [s.tasks.provider, s.tasks.externalId],
        set:
          item.action === 'refresh'
            ? {
                syncedAt: values.syncedAt,
                sourceUpdatedAt: values.sourceUpdatedAt,
                updatedAt: values.updatedAt,
              }
            : values,
        setWhere: and(eq(s.tasks.id, id), isNull(s.tasks.deletedAt)),
      })
      .returning({ id: s.tasks.id });
    if (result[0]?.id !== id) throw new NotionSyncError('concurrent_entity_change');
  }
  for (const item of plan.milestones) {
    const { id, ...values } = item.values;
    const result = await tx
      .insert(s.milestones)
      .values(item.values)
      .onConflictDoUpdate({
        target: [s.milestones.provider, s.milestones.externalId],
        set:
          item.action === 'refresh'
            ? {
                syncedAt: values.syncedAt,
                sourceUpdatedAt: values.sourceUpdatedAt,
                updatedAt: values.updatedAt,
              }
            : values,
        setWhere: and(
          eq(s.milestones.id, id),
          eq(s.milestones.projectId, values.projectId),
          isNull(s.milestones.deletedAt),
        ),
      })
      .returning({ id: s.milestones.id });
    if (result[0]?.id !== id) throw new NotionSyncError('concurrent_entity_change');
  }
  for (const item of plan.resources) {
    if (item.action === 'refresh') continue; // No source freshness columns on resources.
    const { id, ...values } = item.values;
    const result = await tx
      .insert(s.resources)
      .values(item.values)
      .onConflictDoUpdate({
        target: [s.resources.provider, s.resources.externalId],
        set: values,
        setWhere: and(
          eq(s.resources.id, id),
          eq(s.resources.projectId, values.projectId),
          isNull(s.resources.deletedAt),
        ),
      })
      .returning({ id: s.resources.id });
    if (result[0]?.id !== id) throw new NotionSyncError('concurrent_entity_change');
  }
}
export async function startRun(db: SyncDatabase, ids: SourceIds, startedAt: string) {
  return db.transaction(async (tx) => {
    await lock(tx);
    const scope = createHash('sha256').update(JSON.stringify(ids)).digest('hex').slice(0, 20);
    const name = `Notion initial sync (${scope})`;
    const matches = await tx
      .select()
      .from(s.integrations)
      .where(and(eq(s.integrations.provider, 'notion'), eq(s.integrations.name, name)));
    if (matches.length > 1) throw new NotionSyncError('ambiguous_integration');
    const integrationId = matches[0]?.id ?? uuidv7();
    if (!matches.length)
      await tx.insert(s.integrations).values({
        id: integrationId,
        provider: 'notion',
        name,
        enabled: true,
        status: 'unknown',
        lastAttemptAt: startedAt,
      });
    else
      await tx
        .update(s.integrations)
        .set({ lastAttemptAt: startedAt, updatedAt: startedAt })
        .where(eq(s.integrations.id, integrationId));
    const runId = uuidv7();
    await tx.insert(s.syncRuns).values({
      id: runId,
      integrationId,
      type: 'notion.manual.initial',
      status: 'running',
      startedAt,
      metadata: { sources: ids },
    });
    return { integrationId, runId };
  });
}
export type Run = Awaited<ReturnType<typeof startRun>>;
export async function applyBatch(db: SyncDatabase, batch: NormalizedBatch, run: Run, now: string) {
  return db.transaction(async (tx) => {
    await lock(tx);
    const plan = planSync(batch, await readSnapshot(tx), now);
    await applyPlan(tx, plan);
    const created = Object.values(plan.counts).reduce((sum, count) => sum + count.created, 0);
    const updated = Object.values(plan.counts).reduce((sum, count) => sum + count.updated, 0);
    const accepted = plan.areas.length + plan.projects.length + plan.tasks.length;
    const status = plan.issues.length ? (accepted ? 'partial' : 'failed') : 'success';
    const error = plan.issues.length ? JSON.stringify(plan.issues.slice(0, 100)) : null;
    await tx
      .update(s.syncRuns)
      .set({
        status,
        finishedAt: now,
        itemsFetched: Object.values(batch.fetched).reduce((a, b) => a + b, 0),
        itemsCreated: created,
        itemsUpdated: updated,
        error,
        metadata: {
          counts: plan.counts,
          issues: plan.issues.slice(0, 100),
          warnings: plan.warnings.slice(0, 100),
          // Type has no Domain/UI column yet; retain just the normalized value for future mapping.
          taskTypes: Object.fromEntries(
            batch.tasks
              .filter((task) =>
                plan.tasks.some((item) => item.values.externalId === task.externalId),
              )
              .map((task) => [task.externalId, task.sourceType]),
          ),
        },
      })
      .where(eq(s.syncRuns.id, run.runId));
    await tx
      .update(s.integrations)
      .set({
        status: status === 'success' ? 'healthy' : 'error',
        updatedAt: now,
        ...(status === 'success'
          ? { lastSuccessAt: now, lastError: null }
          : { lastErrorAt: now, lastError: error }),
      })
      .where(eq(s.integrations.id, run.integrationId));
    return { plan, status };
  });
}
export async function failRun(db: SyncDatabase, run: Run, code: string, now: string, fetched = 0) {
  await db.transaction(async (tx) => {
    await tx
      .update(s.syncRuns)
      .set({ status: 'failed', finishedAt: now, error: code, itemsFetched: fetched })
      .where(eq(s.syncRuns.id, run.runId));
    await tx
      .update(s.integrations)
      .set({ status: 'error', lastErrorAt: now, lastError: code, updatedAt: now })
      .where(eq(s.integrations.id, run.integrationId));
  });
}
