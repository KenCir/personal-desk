// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { validate, version } from 'uuid';
import * as s from '@personal-desk/database/schema';
import { createReadQueries } from '@personal-desk/database/queries';
import {
  fixtureCollection,
  fixturePages,
  id,
  ids,
  time,
  later,
  title,
  date,
  status,
  prop,
  relation,
  page,
} from './fixtures';
import { synchronize, type Collection } from './sync';
import { applyPlan, preflight, readSnapshot } from './writer';
import { planSync } from './plan';
import { object } from './types';
import { verifyCollection } from './verify';

const client = new PGlite();
const db = drizzle(client, { schema: s });
const reader = createReadQueries(db);
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
const sync = (collection: Collection = fixtureCollection(), dryRun = false, now = time) =>
  synchronize({ db, ids, collect: async () => collection, dryRun, clock: () => now });

describe('Notion PostgreSQL writer', () => {
  it('imports UUID v7 entities, resolves relations and serves existing read models', async () => {
    const report = await sync();
    expect(report.status).toBe('success');
    const snapshot = await readSnapshot(db);
    for (const rows of Object.values(snapshot))
      for (const row of rows) {
        expect(validate(row.id)).toBe(true);
        expect(version(row.id)).toBe(7);
      }
    expect(snapshot.areas[0].externalId).toBe(id(1));
    expect(snapshot.projects[0].areaId).toBe(snapshot.areas[0].id);
    expect(snapshot.tasks.every((task) => task.projectId === snapshot.projects[0].id)).toBe(true);
    const project = (await reader.getProjectBySlug('personal-desk'))!;
    expect(project.areaName).toBe('Development');
    expect((await reader.getNextMilestone(project.id))?.title).toBe('Project deadline');
    expect((await reader.getResources(project.id))[0]).toMatchObject({
      provider: 'github',
      type: 'repository',
      category: 'development',
      url: 'https://github.com/example/personal-desk',
      isPrimary: true,
    });
    const tasks = await reader.getTodayTasks(time);
    expect(tasks).toHaveLength(2);
    expect(tasks.find((task) => task.status !== 'waiting')?.title).toBe('Active task');
    expect((await reader.getActivities()).items).toEqual([]);
    expect((await preflight(db)).ready).toBe(true);
  });
  it('replays idempotently, retaining IDs/slugs/meaningful timestamps and recording zero updates', async () => {
    await sync();
    const before = await readSnapshot(db);
    const report = await sync(fixtureCollection(), false, later);
    const after = await readSnapshot(db);
    expect(report.status).toBe('success');
    expect(
      Object.values(report.counts!).every((count) => count.created === 0 && count.updated === 0),
    ).toBe(true);
    for (const kind of ['areas', 'projects', 'tasks', 'milestones', 'resources'] as const)
      expect(after[kind].map((r) => r.id)).toEqual(before[kind].map((r) => r.id));
    expect(after.projects[0].slug).toBe(before.projects[0].slug);
    expect(after.projects[0].meaningfulUpdatedAt).toBe(before.projects[0].meaningfulUpdatedAt);
    expect(Date.parse(after.projects[0].syncedAt!)).toBe(Date.parse(later));
    const runs = await db.select().from(s.syncRuns);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      status: 'success',
      itemsFetched: 4,
      itemsCreated: 6,
      itemsUpdated: 0,
    });
    expect(runs[1]).toMatchObject({ status: 'success', itemsCreated: 0, itemsUpdated: 0 });
    expect(runs[1].finishedAt).not.toBeNull();
    expect(runs[0].metadata).toMatchObject({ taskTypes: { [id(3)]: ['Work'] } });
  });
  it('dry-run produces counts but changes neither domain rows nor sync metadata', async () => {
    const before = await readSnapshot(db);
    const result = await sync(fixtureCollection(), true);
    expect(result.counts?.projects.created).toBe(1);
    expect(await readSnapshot(db)).toEqual(before);
    expect(await db.select().from(s.integrations)).toEqual([]);
    expect(await db.select().from(s.syncRuns)).toEqual([]);
    await sync();
    const populated = await readSnapshot(db);
    const runs = await db.select().from(s.syncRuns);
    await sync(fixtureCollection(), true, later);
    expect(await readSnapshot(db)).toEqual(populated);
    expect(await db.select().from(s.syncRuns)).toEqual(runs);
  });
  it('keeps slugs on rename and changes source audit timestamps without changing meaningful update', async () => {
    await sync();
    const before = await readSnapshot(db);
    const pages = fixturePages();
    pages.projects[0].last_edited_time = later;
    object(pages.projects[0].properties).Name = title('name', 'Renamed Project');
    pages.areas[0].last_edited_time = later;
    object(pages.areas[0].properties).Name = title('name', 'Renamed Area');
    await sync(fixtureCollection(pages), false, later);
    const after = await readSnapshot(db);
    expect(after.projects[0].slug).toBe(before.projects[0].slug);
    expect(after.areas[0].slug).toBe(before.areas[0].slug);
    expect(after.projects[0].meaningfulUpdatedAt).toBe(before.projects[0].meaningfulUpdatedAt);
    expect(Date.parse(after.projects[0].sourceUpdatedAt!)).toBe(Date.parse(later));
    expect(Date.parse(after.projects[0].updatedAt)).toBe(Date.parse(later));
    const next = '2026-10-30T02:00:00Z';
    pages.projects[0].last_edited_time = next;
    const repeat = await sync(fixtureCollection(pages), false, next);
    expect(repeat.counts?.projects.updated).toBe(0);
    expect((await readSnapshot(db)).projects[0].meaningfulUpdatedAt).toBe(
      before.projects[0].meaningfulUpdatedAt,
    );
  });
  it('updates the same synthetic milestone and logical resource while preserving unrelated manual rows', async () => {
    await sync();
    const before = await readSnapshot(db);
    const projectId = before.projects[0].id;
    await db.insert(s.milestones).values({
      id: id(901),
      provider: 'manual',
      externalId: 'manual',
      projectId,
      title: 'Manual deadline',
      dueAt: '2026-12-01T00:00:00Z',
    });
    await db.insert(s.resources).values({
      id: id(902),
      provider: 'github',
      externalId: 'unrelated',
      projectId,
      type: 'repository',
      category: 'development',
      name: 'Manual repository',
      url: 'https://github.com/manual/repo',
    });
    const pages = fixturePages();
    pages.projects[0].last_edited_time = later;
    object(pages.projects[0].properties).Deadline = date('deadline', '2026-12-31');
    object(pages.projects[0].properties).GitHub = prop(
      'github',
      'url',
      'https://github.com/example/renamed',
    );
    await sync(fixtureCollection(pages), false, later);
    const after = await readSnapshot(db);
    expect(after.milestones.filter((m) => m.provider === 'notion')).toHaveLength(1);
    expect(after.milestones.find((m) => m.provider === 'notion')!.id).toBe(before.milestones[0].id);
    expect(after.resources.find((r) => r.id === before.resources[0].id)!.url).toBe(
      'https://github.com/example/renamed',
    );
    expect(after.resources.find((r) => r.id === id(902))!.url).toBe(
      'https://github.com/manual/repo',
    );
    expect(
      (
        await db
          .select()
          .from(s.milestones)
          .where(eq(s.milestones.id, id(901)))
      )[0].title,
    ).toBe('Manual deadline');
    expect(Date.parse(after.projects[0].meaningfulUpdatedAt)).toBe(Date.parse(later));
  });
  it('handles explicit deadline removal without deletion and retains removed GitHub links with a warning', async () => {
    await sync();
    const pages = fixturePages();
    pages.projects[0].last_edited_time = later;
    object(pages.projects[0].properties).Deadline = date('deadline', null);
    object(pages.projects[0].properties).GitHub = prop('github', 'url', null);
    const report = await sync(fixtureCollection(pages), false, later);
    const snapshot = await readSnapshot(db);
    expect(snapshot.milestones[0]).toMatchObject({
      status: 'cancelled',
      dueAt: null,
      deletedAt: null,
    });
    expect(snapshot.resources).toHaveLength(1);
    expect(snapshot.resources[0].deletedAt).toBeNull();
    expect(report.warnings).toContainEqual({
      code: 'removed_github_link_retained',
      source: 'projects',
      externalId: id(2),
    });
  });
  it('sets completion on Done, preserves it across re-import and clears it on reopening', async () => {
    await sync();
    const pages = fixturePages();
    pages.projects[0].last_edited_time = later;
    object(pages.projects[0].properties).Status = status('Done');
    await sync(fixtureCollection(pages), false, later);
    expect(Date.parse((await readSnapshot(db)).projects[0].completedAt!)).toBe(Date.parse(later));
    const next = '2026-10-30T02:00:00Z';
    pages.projects[0].last_edited_time = next;
    await sync(fixtureCollection(pages), false, next);
    expect(Date.parse((await readSnapshot(db)).projects[0].completedAt!)).toBe(Date.parse(later));
    object(pages.projects[0].properties).Status = status('Active');
    await sync(fixtureCollection(pages), false, next);
    expect((await readSnapshot(db)).projects[0].completedAt).toBeNull();
    expect((await readSnapshot(db)).milestones[0].status).toBe('pending');
  });
  it('keeps healthy existing data on invalid entities and records partial failure', async () => {
    await sync();
    const before = await readSnapshot(db);
    const pages = fixturePages();
    object(pages.projects[0].properties).Status = status('Unsupported');
    object(pages.tasks[0].properties).Project = relation('project', [id(999)]);
    object(pages.areas[0].properties).Name = title('name', 'Valid rename');
    const result = await sync(fixtureCollection(pages), false, later);
    const after = await readSnapshot(db);
    expect(result.status).toBe('partial');
    expect(after.projects[0]).toEqual(before.projects[0]);
    expect(after.tasks.find((t) => t.externalId === id(3))).toEqual(
      before.tasks.find((t) => t.externalId === id(3)),
    );
    expect(after.areas[0].name).toBe('Valid rename');
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['unsupported_status', 'unresolved_project_relation']),
    );
  });
  it('rejects unknown areas and does not guess a task project', async () => {
    const pages = fixturePages();
    object(pages.projects[0].properties).Area = relation('area', [id(999)]);
    const result = await sync(fixtureCollection(pages));
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['unresolved_area_relation', 'unresolved_project_relation']),
    );
    expect((await readSnapshot(db)).projects).toEqual([]);
    expect((await readSnapshot(db)).tasks).toEqual([]);
  });
  it('avoids slug collisions and preserves identity for non-Latin titles', async () => {
    const pages = fixturePages();
    pages.areas.push(page(id(5), 'areas', { Name: title('name', 'Development') }));
    const other = structuredClone(pages.projects[0]);
    other.id = id(6);
    pages.projects.push(other);
    const japanese = structuredClone(pages.projects[0]);
    japanese.id = id(7);
    object(japanese.properties).Name = title('name', '日本語の計画');
    pages.projects.push(japanese);
    await sync(fixtureCollection(pages));
    const before = await readSnapshot(db);
    expect(new Set(before.projects.map((p) => p.slug)).size).toBe(3);
    expect(before.projects.every((p) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug))).toBe(true);
    await sync(fixtureCollection(pages), false, later);
    expect((await readSnapshot(db)).projects.map((p) => [p.id, p.slug]).sort()).toEqual(
      before.projects.map((p) => [p.id, p.slug]).sort(),
    );
  });
  it('does not soft-delete absent rows, restore deleted rows, or overwrite newer source snapshots', async () => {
    await sync();
    const before = await readSnapshot(db);
    const empty = fixtureCollection({ areas: [], projects: [], tasks: [] });
    await sync(empty, false, later);
    expect(await readSnapshot(db)).toEqual(before);
    await db
      .update(s.projects)
      .set({ deletedAt: later })
      .where(eq(s.projects.id, before.projects[0].id));
    const result = await sync();
    expect(result.issues.some((i) => i.code === 'existing_soft_deleted_entity')).toBe(true);
    expect((await readSnapshot(db)).projects[0].deletedAt).not.toBeNull();
    const pages = fixturePages();
    pages.areas[0].last_edited_time = '2026-10-01T00:00:00Z';
    object(pages.areas[0].properties).Name = title('name', 'Old snapshot');
    await sync(fixtureCollection(pages));
    expect((await readSnapshot(db)).areas[0].name).toBe('Development');
  });
  it('rolls back every entity write if a child insert fails and records failure separately', async () => {
    await client.exec(
      "CREATE FUNCTION fail_resource() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'private SQL payload'; END $$ LANGUAGE plpgsql; CREATE TRIGGER reject_resource BEFORE INSERT ON resources FOR EACH ROW EXECUTE FUNCTION fail_resource()",
    );
    try {
      const result = await sync();
      expect(result.status).toBe('failed');
      expect(result.issues).toEqual([{ code: 'operation_failed' }]);
      expect((await readSnapshot(db)).areas).toEqual([]);
      expect((await readSnapshot(db)).projects).toEqual([]);
      expect((await db.select().from(s.syncRuns))[0]).toMatchObject({
        status: 'failed',
        itemsCreated: 0,
        itemsUpdated: 0,
        error: 'operation_failed',
      });
    } finally {
      await client.exec('DROP TRIGGER reject_resource ON resources; DROP FUNCTION fail_resource()');
    }
  });
  it('records collector failures without altering existing entities or leaking exceptions', async () => {
    await sync();
    const before = await readSnapshot(db);
    const result = await synchronize({
      db,
      ids,
      dryRun: false,
      collect: async () => {
        throw new Error('ntn_private-token');
      },
      clock: () => later,
    });
    expect(result.status).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(await readSnapshot(db)).toEqual(before);
    expect((await db.select().from(s.syncRuns)).at(-1)?.error).toBe('operation_failed');
  });
  it('uses uniqueness constraints instead of changing an existing conflicting ID', async () => {
    const batch = fixtureCollection().batch;
    const plan = planSync(batch, await readSnapshot(db), time);
    await db.insert(s.areas).values({
      id: id(999),
      provider: 'notion',
      externalId: id(1),
      name: 'Concurrent',
      slug: 'concurrent',
    });
    await expect(db.transaction((tx) => applyPlan(tx, plan))).rejects.toThrow(
      'concurrent_entity_change',
    );
    expect((await db.select().from(s.areas))[0].id).toBe(id(999));
    expect(await db.select().from(s.projects)).toEqual([]);
  });
  it('verifies a collected snapshot twice in an independent disposable database', async () => {
    const result = await verifyCollection(fixtureCollection(), ids);
    expect(result).toMatchObject({
      status: 'success',
      stableInternalIds: true,
      noDuplicateOrUnnecessaryUpdates: true,
      readVerification: { projects: 1, projectDetails: 1, milestones: 1, resources: 1 },
    });
    expect((await readSnapshot(db)).projects).toEqual([]);
  }, 15000);
});
