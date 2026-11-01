// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { effectiveBackup, effectiveHealth, overallStatus } from '@personal-desk/core';
import { createReadQueries } from './queries';
import * as s from './schema';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = '2026-09-19T00:00:00.000Z';
const client = new PGlite();
const db = drizzle(client, { schema: s });
const reader = createReadQueries(db);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  await db.insert(s.areas).values([
    { id: id(1), provider: 'notion', externalId: 'a1', name: 'Development', slug: 'dev' },
    {
      id: id(2),
      provider: 'notion',
      externalId: 'a2',
      name: 'Deleted Area',
      slug: 'deleted',
      deletedAt: now,
    },
  ]);
  await db.insert(s.projects).values([
    {
      id: id(10),
      provider: 'notion',
      externalId: 'p1',
      slug: 'desk',
      name: 'Personal Desk',
      description: '100%_ready',
      areaId: id(1),
      status: 'active',
      meaningfulUpdatedAt: '2026-09-18T00:00:00Z',
      updatedAt: now,
    },
    {
      id: id(11),
      provider: 'notion',
      externalId: 'p2',
      slug: 'blocked',
      name: 'Blocked',
      status: 'blocked',
      meaningfulUpdatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: id(12),
      provider: 'notion',
      externalId: 'p3',
      slug: 'old-done',
      name: 'Old done',
      status: 'done',
      meaningfulUpdatedAt: now,
      completedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: id(13),
      provider: 'notion',
      externalId: 'p4',
      slug: 'new-done',
      name: 'New done',
      status: 'done',
      meaningfulUpdatedAt: '2026-09-01T00:00:00Z',
      completedAt: '2026-09-02T00:00:00Z',
    },
    {
      id: id(14),
      provider: 'notion',
      externalId: 'p5',
      slug: 'no-area',
      name: 'No Area',
      areaId: id(2),
      status: 'waiting',
      meaningfulUpdatedAt: now,
    },
    {
      id: id(19),
      provider: 'notion',
      externalId: 'p9',
      slug: 'deleted',
      name: 'Deleted Project',
      areaId: id(1),
      status: 'active',
      meaningfulUpdatedAt: now,
      deletedAt: now,
    },
  ]);
  await db.insert(s.milestones).values([
    {
      id: id(20),
      provider: 'notion',
      externalId: 'm1',
      projectId: id(10),
      title: 'Next',
      status: 'pending',
      dueAt: '2026-09-20T00:00:00+09:00',
      allDay: true,
    },
    {
      id: id(21),
      provider: 'notion',
      externalId: 'm2',
      projectId: id(10),
      title: 'Overdue',
      status: 'pending',
      dueAt: '2026-09-18T00:00:00+09:00',
      allDay: true,
    },
    {
      id: id(22),
      provider: 'notion',
      externalId: 'm3',
      projectId: id(10),
      title: 'Completed',
      status: 'completed',
      dueAt: '2026-09-01T00:00:00Z',
    },
    {
      id: id(23),
      provider: 'notion',
      externalId: 'm4',
      projectId: id(10),
      title: 'Deleted',
      status: 'pending',
      dueAt: '2026-09-01T00:00:00Z',
      deletedAt: now,
    },
    {
      id: id(24),
      provider: 'notion',
      externalId: 'm5',
      projectId: id(19),
      title: 'Deleted parent',
      status: 'pending',
      dueAt: '2026-09-01T00:00:00Z',
    },
    {
      id: id(25),
      provider: 'notion',
      externalId: 'm6',
      projectId: id(10),
      title: 'No due date',
      status: 'pending',
    },
  ]);
  await db.insert(s.resources).values([
    {
      id: id(30),
      projectId: id(10),
      name: 'Repository',
      type: 'repository',
      category: 'development',
      provider: 'github',
      url: 'https://github.com/',
      sortOrder: 2,
    },
    {
      id: id(31),
      projectId: id(10),
      name: 'Docs',
      type: 'documentation',
      category: 'documentation',
      provider: 'notion',
      url: 'https://notion.so/',
      sortOrder: 1,
      isPrimary: true,
    },
    {
      id: id(32),
      projectId: id(10),
      name: 'Deleted',
      type: 'other',
      category: 'other',
      provider: 'custom',
      url: 'https://example.com/',
      deletedAt: now,
    },
    {
      id: id(33),
      projectId: id(19),
      name: 'Deleted parent',
      type: 'other',
      category: 'other',
      provider: 'custom',
      url: 'https://example.com/',
    },
  ]);
  await db.insert(s.systems).values([
    {
      id: id(40),
      name: 'VPS',
      slug: 'vps',
      status: 'healthy',
      lastSuccessAt: '2026-09-18T23:55:00Z',
      cpuUsage: 18,
    },
    { id: id(41), name: 'Deleted system', slug: 'deleted', status: 'down', deletedAt: now },
  ]);
  await db.insert(s.services).values([
    {
      id: id(50),
      name: 'PostgreSQL',
      slug: 'postgres',
      systemId: id(40),
      status: 'healthy',
      lastSuccessAt: now,
    },
    {
      id: id(51),
      name: 'Independent service',
      slug: 'external',
      systemId: id(41),
      status: 'unknown',
    },
    { id: id(52), name: 'Deleted service', slug: 'deleted', status: 'down', deletedAt: now },
  ]);
  await db.insert(s.backups).values([
    {
      id: id(60),
      name: 'Backup',
      systemId: id(40),
      serviceId: id(50),
      status: 'success',
      staleAfterSeconds: 3600,
      lastSuccessAt: '2026-09-18T20:00:00Z',
    },
    {
      id: id(61),
      name: 'Deleted backup',
      status: 'failed',
      staleAfterSeconds: 3600,
      deletedAt: now,
    },
  ]);
  await db.insert(s.alerts).values([
    {
      id: id(70),
      provider: 'prometheus',
      title: 'Active',
      severity: 'warning',
      status: 'active',
      systemId: id(41),
      startedAt: now,
      backupId: id(60),
    },
    {
      id: id(71),
      provider: 'prometheus',
      title: 'Resolved',
      severity: 'critical',
      status: 'resolved',
      startedAt: now,
    },
  ]);
  await db.insert(s.activities).values(
    Array.from({ length: 66 }, (_, n) => ({
      id: id(100 + n),
      projectId: id(10),
      provider: 'github',
      type: 'pr.merged',
      title: `PR ${n}`,
      description: n === 0 ? '100%_ready' : 'Build finished',
      category: n % 2 === 0 ? ('source_control' as const) : ('deployment' as const),
      importance: n % 2 === 0 ? ('low' as const) : ('high' as const),
      occurredAt: `2026-09-18T23:00:00.${String(999999 - n).padStart(6, '0')}Z`,
    })),
  );
  await db.insert(s.activities).values([
    {
      id: id(180),
      projectId: id(19),
      provider: 'notion',
      type: 'project.changed',
      title: 'Historical activity',
      category: 'project',
      importance: 'normal',
      occurredAt: now,
      internalPath: '/projects/deleted',
    },
    {
      id: id(181),
      serviceId: id(50),
      provider: 'prometheus',
      type: 'service.recovered',
      title: 'Recovery',
      category: 'infrastructure',
      importance: 'normal',
      occurredAt: now,
    },
    {
      id: id(182),
      provider: 'custom',
      type: 'other',
      title: 'Tie A',
      category: 'other',
      importance: 'normal',
      occurredAt: now,
    },
    {
      id: id(183),
      provider: 'custom',
      type: 'other',
      title: 'Tie B',
      category: 'other',
      importance: 'normal',
      occurredAt: now,
    },
  ]);
  await db.insert(s.tasks).values([
    {
      id: id(200),
      provider: 'notion',
      externalId: 't1',
      projectId: id(10),
      title: 'Today',
      status: 'todo',
      priority: 'urgent',
      dueAt: '2026-09-19T00:00:00+09:00',
      allDay: true,
    },
    {
      id: id(201),
      provider: 'notion',
      externalId: 't2',
      projectId: id(10),
      title: 'Overdue',
      status: 'in_progress',
      priority: 'low',
      dueAt: '2026-09-18T00:00:00+09:00',
      allDay: true,
    },
    {
      id: id(202),
      provider: 'notion',
      externalId: 't3',
      title: 'Waiting',
      status: 'waiting',
      dueAt: '2026-09-19T14:00:00+09:00',
    },
    {
      id: id(203),
      provider: 'notion',
      externalId: 't4',
      title: 'Tomorrow Tokyo',
      status: 'todo',
      dueAt: '2026-09-19T15:00:00Z',
    },
    {
      id: id(204),
      provider: 'notion',
      externalId: 't5',
      title: 'Done',
      status: 'done',
      dueAt: now,
    },
    {
      id: id(205),
      provider: 'notion',
      externalId: 't6',
      title: 'Deleted',
      status: 'todo',
      dueAt: now,
      deletedAt: now,
    },
    {
      id: id(206),
      provider: 'notion',
      externalId: 't7',
      projectId: id(19),
      title: 'Deleted parent',
      status: 'todo',
      dueAt: now,
    },
  ]);
}, 30000);
afterAll(() => client.close());

describe('database read contract', () => {
  it('lists live projects in domain order and uses meaningful update, not audit update', async () => {
    const projects = await reader.getProjects();
    expect(projects.map((p) => p.slug)).toEqual([
      'blocked',
      'desk',
      'no-area',
      'new-done',
      'old-done',
    ]);
    expect(new Date(projects[1].updatedAt).toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(projects[0].description).toBe('');
  });
  it('gets project by slug; missing and soft-deleted projects are absent', async () => {
    expect((await reader.getProjectBySlug('desk'))?.id).toBe(id(10));
    expect(await reader.getProjectBySlug('deleted')).toBeNull();
    expect(await reader.getProjectBySlug('missing')).toBeNull();
  });
  it('joins only live areas without hiding the project', async () => {
    expect(await reader.getAreas()).toEqual([{ id: id(1), name: 'Development' }]);
    expect((await reader.getProjectBySlug('desk'))?.areaName).toBe('Development');
    expect((await reader.getProjectBySlug('no-area'))?.areaId).toBeNull();
    expect(await reader.getProjects({ areaId: id(2) })).toEqual([]);
  });
  it('supports AND filters and treats percent/underscore as literal search', async () => {
    expect(
      (await reader.getProjects({ search: 'development', status: 'active', areaId: id(1) })).map(
        (p) => p.slug,
      ),
    ).toEqual(['desk']);
    expect(await reader.getProjects({ search: 'desk', status: 'blocked' })).toEqual([]);
    expect((await reader.getProjects({ search: '%_' })).map((p) => p.slug)).toEqual(['desk']);
  });
  it('selects nearest pending dated milestone, excluding deleted children and parents', async () => {
    expect((await reader.getNextMilestone())?.title).toBe('Overdue');
    expect((await reader.getNextMilestone(id(10)))?.title).toBe('Overdue');
    expect(await reader.getNextMilestone(id(19))).toBeNull();
    expect(await reader.getNextMilestone(id(11))).toBeNull();
  });
  it('reads resources in configured order, excluding soft deletes', async () => {
    expect((await reader.getResources(id(10))).map((r) => r.name)).toEqual(['Docs', 'Repository']);
    expect(await reader.getResources(id(19))).toEqual([]);
  });
  it('reads project activity including low with category filter', async () => {
    const page = await reader.getActivities({ projectId: id(10), category: 'source_control' });
    expect(page.items).toHaveLength(30);
    expect(page.items.every((a) => a.projectId === id(10) && a.importance === 'low')).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    expect((await reader.getActivities({ projectId: id(19) })).items).toEqual([]);
  });
  it('applies global title/description/project search with AND filters and exact importance', async () => {
    expect(
      (
        await reader.getActivities({
          search: 'personal',
          projectId: id(10),
          category: 'deployment',
          importance: 'high',
        })
      ).items,
    ).toHaveLength(30);
    expect(
      (await reader.getActivities({ search: 'Build', importance: 'low', category: 'deployment' }))
        .items,
    ).toEqual([]);
    expect((await reader.getActivities({ search: '%_' })).items.map((a) => a.title)).toEqual([
      'PR 0',
    ]);
    expect((await reader.getActivities({ search: 'recovery' })).items[0].systemName).toBe(
      'PostgreSQL',
    );
  });
  it('preserves microseconds across 30+30+6 pages without gaps or duplicates', async () => {
    const first = await reader.getActivities({ projectId: id(10) });
    const second = await reader.getActivities({ projectId: id(10), cursor: first.nextCursor });
    const third = await reader.getActivities({ projectId: id(10), cursor: second.nextCursor });
    expect([first.items.length, second.items.length, third.items.length]).toEqual([30, 30, 6]);
    expect(third.nextCursor).toBeNull();
    expect([...first.items, ...second.items, ...third.items].map((a) => a.id)).toEqual(
      Array.from({ length: 66 }, (_, n) => id(100 + n)),
    );
  });
  it('uses ID as a tie breaker and does not duplicate after newer insertion', async () => {
    const first = await reader.getActivities({ category: 'other', limit: 1 });
    await db.insert(s.activities).values({
      id: id(184),
      provider: 'custom',
      type: 'other',
      title: 'Newer',
      category: 'other',
      importance: 'normal',
      occurredAt: '2026-09-20T00:00:00Z',
    });
    const second = await reader.getActivities({
      category: 'other',
      limit: 1,
      cursor: first.nextCursor,
    });
    expect([first.items[0].title, second.items[0].title]).toEqual(['Tie A', 'Tie B']);
    expect(second.nextCursor).toBeNull();
  });
  it('keeps history from deleted projects but suppresses deleted labels/internal links', async () => {
    const row = (await reader.getActivities({ search: 'Historical' })).items[0];
    expect(row.projectId).toBe(id(19));
    expect(row.projectSlug).toBeNull();
    expect(row.projectName).toBeNull();
    expect(row.internalPath).toBeNull();
  });
  it('reads live infrastructure and active alerts, preserving status for derived stale', async () => {
    const infra = await reader.getInfrastructure();
    expect(infra.systems.map((s) => s.name)).toEqual(['VPS']);
    expect(infra.services).toHaveLength(2);
    expect(infra.services.find((s) => s.name === 'Independent service')?.systemId).toBeNull();
    expect(infra.backups).toHaveLength(1);
    expect(infra.alerts.map((a) => a.title)).toEqual(['Active']);
    expect(infra.alerts[0].systemId).toBeNull();
    expect(infra.alerts[0].backupId).toBe(id(60));
    for (const rows of Object.values(infra)) {
      for (const row of rows) {
        expect(row).not.toHaveProperty('createdAt');
        expect(row).not.toHaveProperty('deletedAt');
        expect(row).not.toHaveProperty('metadata');
      }
    }
    expect(infra.systems[0].status).toBe('healthy');
    expect(effectiveHealth(infra.systems[0], now)).toBe('stale');
    expect(infra.backups[0].expectedIntervalSeconds).toBeNull();
    expect(effectiveBackup(infra.backups[0], now)).toBe('stale');
    expect(overallStatus(infra, now)).toBe('warning');
  });
  it('reads overdue/today tasks in Tokyo including waiting after additive migration', async () => {
    const tasks = await reader.getTodayTasks(now);
    expect(tasks.map((t) => t.title)).toEqual(['Overdue', 'Today', 'Waiting']);
    expect(tasks[2].status).toBe('waiting');
    expect(tasks.find((t) => t.status !== 'waiting')?.title).toBe('Overdue');
  });
  it('does not turn query failures into empty or mock results', async () => {
    const broken = new PGlite();
    try {
      await expect(
        createReadQueries(drizzle(broken, { schema: s })).getProjects(),
      ).rejects.toThrow();
    } finally {
      await broken.close();
    }
  });
  it('returns genuine empty models from an initialized empty database', async () => {
    const empty = new PGlite();
    try {
      const emptyDb = drizzle(empty, { schema: s });
      await migrate(emptyDb, {
        migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
      });
      const source = createReadQueries(emptyDb);
      expect(await source.getProjects()).toEqual([]);
      expect(await source.getAreas()).toEqual([]);
      expect(await source.getProjectBySlug('missing')).toBeNull();
      expect(await source.getNextMilestone()).toBeNull();
      expect(await source.getTodayTasks(now)).toEqual([]);
      expect(await source.getActivities()).toEqual({ items: [], nextCursor: null });
      expect(await source.getInfrastructure()).toEqual({
        systems: [],
        services: [],
        backups: [],
        alerts: [],
      });
    } finally {
      await empty.close();
    }
  });
  it('limits recent project activity to five normal-or-higher events', async () => {
    const page = await reader.getActivities({
      projectId: id(10),
      minimumImportance: 'normal',
      until: now,
      limit: 5,
    });
    expect(page.items).toHaveLength(5);
    expect(page.items.every((a) => a.projectId === id(10) && a.importance === 'high')).toBe(true);
  });
});
