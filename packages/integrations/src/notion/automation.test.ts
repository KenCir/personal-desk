// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import * as s from '@personal-desk/database/schema';
import { createReadQueries } from '@personal-desk/database/queries';
import { fixtureCollection, fixturePages, id, ids, time, later, status, date } from './fixtures';
import { object, type CollectionRequest } from './types';
import { synchronize, type Collection } from './sync';
import { applyPlan, readSnapshot, type LockGuard } from './writer';
import { planSync } from './plan';
import { readState } from './state';

const client = new PGlite();
const db = drizzle(client, { schema: s });
beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../../database/drizzle', import.meta.url)),
  });
}, 30000);
beforeEach(async () => {
  await client.exec(
    'TRUNCATE areas, projects, tasks, milestones, resources, activities, integrations, sync_runs CASCADE',
  );
});
afterAll(() => client.close());
const run = (
  collection: Collection = fixtureCollection(),
  now = time,
  extras: Partial<Parameters<typeof synchronize>[0]> = {},
) =>
  synchronize({
    db,
    ids,
    collect: async () => collection,
    clock: () => now,
    dryRun: false,
    ...extras,
  });
const activities = () => db.select().from(s.activities);
const state = async () => readState(db, (await db.select().from(s.integrations))[0]?.id, '');

it('adopts existing imported entities as baseline without historical created activities', async () => {
  await applyPlan(db, planSync(fixtureCollection().batch, await readSnapshot(db), time));
  expect((await run()).status).toBe('success');
  expect(await activities()).toEqual([]);
  expect((await state()).state.baselineAt).toBe(time);
  const pages = fixturePages();
  const project = structuredClone(pages.projects[0]);
  project.id = id(12);
  project.created_time = later;
  project.last_edited_time = later;
  pages.projects.push(project);
  expect((await run(fixtureCollection(pages), later)).status).toBe('success');
  expect((await activities()).map((row) => row.type)).toEqual(['project.created']);
  await run(fixtureCollection(pages), later);
  expect(await activities()).toHaveLength(1);
  // A newly visible old project is imported, but is not a new creation.
  project.id = id(13);
  project.created_time = '2026-10-01T00:00:00Z';
  await run(fixtureCollection(pages), later);
  expect(await activities()).toHaveLength(1);
});

it('does not establish a baseline on partial failure and resets it on mapping changes', async () => {
  const partial = fixtureCollection();
  partial.batch.issues.push({ code: 'invalid_entity', source: 'tasks', externalId: id(99) });
  expect((await run(partial)).status).toBe('partial');
  expect((await state()).state.baselineAt).toBeNull();
  expect((await state()).watermark).toBeNull();
  await run();
  const pages = fixturePages();
  object(pages.projects[0].properties).Status = status('Done');
  pages.projects[0].last_edited_time = later;
  await run(fixtureCollection(pages), later, { fingerprint: 'changed' });
  expect(await activities()).toEqual([]);
  const integration = (await db.select().from(s.integrations))[0];
  expect((await readState(db, integration.id, 'changed')).state.baselineAt).toBe(later);
});

it('emits meaningful transitions exactly once, including repeated transitions with equal source timestamps', async () => {
  await run();
  const pages = fixturePages();
  pages.projects[0].last_edited_time = later;
  object(pages.projects[0].properties).Status = status('Done');
  await run(fixtureCollection(pages), later);
  await run(fixtureCollection(pages), later);
  object(pages.projects[0].properties).Status = status('Active');
  await run(fixtureCollection(pages), later);
  object(pages.projects[0].properties).Status = status('Done');
  await run(fixtureCollection(pages), later);
  expect((await activities()).map((row) => row.type)).toEqual([
    'project.completed',
    'project.reopened',
    'project.completed',
  ]);
  expect(new Set((await activities()).map((row) => row.dedupKey)).size).toBe(3);
});

it('uses one deadline event and only high/urgent task completion, excluding routine edits', async () => {
  await run();
  const pages = fixturePages();
  pages.projects[0].last_edited_time = later;
  await run(fixtureCollection(pages), later);
  expect(await activities()).toEqual([]);
  object(pages.projects[0].properties).Deadline = date('deadline', '2026-12-01');
  object(pages.tasks[0].properties).Status = status('Done');
  pages.tasks[0].last_edited_time = later;
  await run(fixtureCollection(pages), later);
  expect((await activities()).map((row) => row.type)).toEqual([
    'project.deadline_changed',
    'task.completed',
  ]);
  const reader = createReadQueries(db);
  expect((await reader.getActivities()).items).toHaveLength(2);
});

it('keeps missing entities even after a complete empty reconciliation and reports a warning', async () => {
  await run();
  const report = await run(fixtureCollection({ areas: [], projects: [], tasks: [] }), later);
  expect(report.status).toBe('success');
  expect('deleted' in report && report.deleted).toBe(0);
  expect(
    'warnings' in report &&
      report.warnings?.filter((row) => row.code === 'missing_from_full_sync_retained'),
  ).toHaveLength(4);
  expect((await db.select().from(s.projects))[0].deletedAt).toBeNull();
  expect((await db.select().from(s.tasks)).every((row) => !row.deletedAt)).toBe(true);
});

it('only soft deletes validated explicit archived/trash entities, retaining child data and activity history', async () => {
  await run();
  const pages = fixturePages();
  object(pages.projects[0].properties).Status = status('Done');
  pages.projects[0].last_edited_time = later;
  await run(fixtureCollection(pages), later);
  pages.projects[0].archived = true;
  pages.tasks[0].in_trash = true;
  pages.tasks[0].last_edited_time = later;
  const report = await run(fixtureCollection(pages), later);
  expect('deleted' in report && report.deleted).toBe(2);
  expect((await db.select().from(s.projects))[0].deletedAt).not.toBeNull();
  expect((await db.select().from(s.tasks)).filter((row) => row.deletedAt)).toHaveLength(1);
  expect((await db.select().from(s.resources))[0].deletedAt).toBeNull();
  expect(await activities()).toHaveLength(1);
  const reader = createReadQueries(db);
  expect(await reader.getProjects()).toEqual([]);
  expect((await reader.getActivities()).items[0].internalPath).toBeNull();
  expect('deleted' in (await run(fixtureCollection(pages), later))).toBe(true);
});

it('rejects foreign-scope, older, and contradictory deletion signals', async () => {
  await run();
  const pages = fixturePages();
  pages.projects[0].archived = true;
  pages.projects[0].parent = { type: 'data_source_id', data_source_id: id(999) };
  await run(fixtureCollection(pages), later);
  expect((await db.select().from(s.projects))[0].deletedAt).toBeNull();
  pages.projects[0].parent = { type: 'data_source_id', data_source_id: ids.projects };
  pages.projects[0].last_edited_time = '2020-01-01T00:00:00Z';
  await run(fixtureCollection(pages), later);
  expect((await db.select().from(s.projects))[0].deletedAt).toBeNull();
  pages.projects[0].last_edited_time = later;
  pages.projects.push({ ...pages.projects[0], archived: false });
  await run(fixtureCollection(pages), later);
  expect((await db.select().from(s.projects))[0].deletedAt).toBeNull();
});

it('rolls back domain changes, activities and cursor together if activity persistence fails', async () => {
  await run();
  const before = await state();
  await db.execute(
    sql`alter table activities add constraint reject_test_activity check (type <> 'project.completed')`,
  );
  try {
    const pages = fixturePages();
    object(pages.projects[0].properties).Status = status('Done');
    pages.projects[0].last_edited_time = later;
    expect((await run(fixtureCollection(pages), later)).status).toBe('failed');
    expect((await db.select().from(s.projects))[0].status).toBe('active');
    expect(await activities()).toEqual([]);
    expect(await state()).toEqual(before);
    expect((await db.select().from(s.syncRuns)).map((row) => row.status)).toEqual([
      'success',
      'failed',
    ]);
  } finally {
    await db.execute(sql`alter table activities drop constraint reject_test_activity`);
  }
});

it('uses an overlapping incremental watermark and never advances it on partial or failed collection', async () => {
  const requests: CollectionRequest[] = [];
  const collect = async (request: CollectionRequest) => {
    requests.push(request);
    return fixtureCollection();
  };
  await run(undefined, time, { collect, mode: 'incremental' });
  await run(undefined, later, { collect, mode: 'incremental' });
  expect(requests).toEqual([
    { mode: 'full' },
    { mode: 'incremental', since: '2026-10-29T23:58:00.000Z' },
  ]);
  const partial = fixtureCollection();
  partial.batch.issues.push({ code: 'invalid_row' });
  await run(partial, '2026-10-30T02:00:00Z', { mode: 'incremental' });
  expect((await state()).watermark).toBe(later);
  await run({ ...fixtureCollection(), fatal: true }, '2026-10-30T03:00:00Z');
  expect((await state()).watermark).toBe(later);
  await run(undefined, '2026-10-30T07:00:00Z', { collect, mode: 'incremental' });
  expect(requests.at(-1)).toEqual({ mode: 'full' });
});

it('dry run does not change entities, baseline, cursor, health or sync runs', async () => {
  await run();
  const before = {
    state: await state(),
    integrations: await db.select().from(s.integrations),
    runs: await db.select().from(s.syncRuns),
  };
  const pages = fixturePages();
  object(pages.projects[0].properties).Status = status('Done');
  pages.projects[0].last_edited_time = later;
  const report = await run(fixtureCollection(pages), later, { dryRun: true });
  expect('activitiesCreated' in report && report.activitiesCreated).toBe(1);
  expect(await activities()).toEqual([]);
  expect({
    state: await state(),
    integrations: await db.select().from(s.integrations),
    runs: await db.select().from(s.syncRuns),
  }).toEqual(before);
});

it('honors disabled integration and persisted Retry-After without collecting or starting another run', async () => {
  await run();
  const collect = vi.fn(async () => fixtureCollection());
  await db.update(s.integrations).set({ enabled: false });
  expect((await run(undefined, later, { collect })).status).toBe('skipped');
  expect(collect).not.toHaveBeenCalled();
  await db.update(s.integrations).set({ enabled: true });
  await run({ ...fixtureCollection(), fatal: true, retryNotBefore: '2026-10-30T04:00:00Z' }, later);
  expect((await run(undefined, '2026-10-30T02:00:00Z', { collect })).status).toBe('skipped');
  expect(collect).not.toHaveBeenCalled();
  expect(await db.select().from(s.syncRuns)).toHaveLength(2);
  expect((await db.select().from(s.integrations))[0].lastSuccessAt).toBe('2026-10-30 00:00:00+00');
});

it('aborts saving on lock loss after collection and leaves the run for locked recovery', async () => {
  let lost = false;
  const assertHeld: LockGuard = async () => {
    if (lost) throw new Error('notion_lock_lost');
  };
  const report = await run(undefined, time, {
    assertHeld,
    collect: async () => {
      lost = true;
      return fixtureCollection();
    },
  });
  expect(report.status).toBe('failed');
  expect(report.issues).toEqual([{ code: 'notion_lock_lost' }]);
  expect(await db.select().from(s.projects)).toEqual([]);
  const interrupted = (await db.select().from(s.syncRuns))[0];
  expect(interrupted.status).toBe('running');
  lost = false;
  await run(undefined, later, { assertHeld });
  expect(
    (await db.select().from(s.syncRuns).where(eq(s.syncRuns.id, interrupted.id)))[0].error,
  ).toBe('interrupted_sync');
});
