// @vitest-environment node
import { expect, it } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDatabase } from './index';
import { createReadQueries } from './queries';
import * as schema from './schema';

// Never fall back to DATABASE_URL or .env (which can point at personal data).
const url = process.env.POSTGRES_TEST_URL;

it.skipIf(!url)(
  'validates migrated PostgreSQL 18 schema and read queries',
  async () => {
    const target = new URL(url!);
    if (
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      target.pathname !== '/personal_desk_ci'
    ) {
      throw new Error('POSTGRES_TEST_URL must target a disposable local personal_desk_ci DB');
    }
    const connection = createDatabase(url!);
    const rollback = new Error('rollback test fixtures');
    try {
      await expect(
        connection.db.transaction(async (tx) => {
          const version = await tx.execute(sql`show server_version_num`);
          expect(Math.floor(Number(version[0].server_version_num) / 10000)).toBe(18);
          const tables = await tx.execute(sql`
          select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'
          order by table_name
        `);
          expect(tables.map((row) => row.table_name)).toEqual([
            'activities',
            'alerts',
            'areas',
            'backups',
            'integration_cursors',
            'integrations',
            'milestones',
            'projects',
            'resources',
            'services',
            'sync_runs',
            'systems',
            'tasks',
          ]);
          const timestamps = await tx.execute(sql`
          select column_name from information_schema.columns
          where table_schema = 'public' and column_name like '%_at'
            and data_type <> 'timestamp with time zone'
        `);
          expect(timestamps).toHaveLength(0);
          const foreignKeys = await tx.execute(sql`
          select conname from pg_constraint
          where contype = 'f' and connamespace = 'public'::regnamespace
        `);
          expect(foreignKeys).toHaveLength(15);
          const indexes = await tx.execute(sql`
          select indexname from pg_indexes where schemaname = 'public'
          and indexname like '%_idx'
        `);
          expect(indexes).toHaveLength(20);
          const enums = await tx.execute(sql`
          select enumlabel from pg_enum join pg_type on enumtypid = pg_type.oid
          where typname = 'task_status' order by enumsortorder
        `);
          expect(enums.map((row) => row.enumlabel)).toEqual([
            'todo',
            'in_progress',
            'waiting',
            'done',
            'cancelled',
          ]);

          const reader = createReadQueries(tx);
          expect(await reader.getProjects()).toEqual([]);
          expect(await reader.getAreas()).toEqual([]);
          expect(await reader.getActivities()).toEqual({ items: [], nextCursor: null });
          expect(await reader.getInfrastructure()).toEqual({
            systems: [],
            services: [],
            backups: [],
            alerts: [],
          });
          const area = '00000000-0000-4000-8000-000000000001';
          const project = '00000000-0000-4000-8000-000000000002';
          await tx.insert(schema.areas).values({
            id: area,
            provider: 'test',
            externalId: 'area',
            name: 'Area',
            slug: 'area',
          });
          await tx.insert(schema.projects).values({
            id: project,
            provider: 'test',
            externalId: 'project',
            name: 'Project',
            slug: 'project',
            areaId: area,
            meaningfulUpdatedAt: '2026-09-19T09:00:00+09:00',
          });
          await tx.insert(schema.tasks).values({
            id: '00000000-0000-4000-8000-000000000003',
            provider: 'test',
            externalId: 'task',
            title: 'Waiting',
            status: 'waiting',
            projectId: project,
            dueAt: '2026-09-19T09:00:00+09:00',
          });
          const result = await reader.getProjectBySlug('project');
          expect(result?.areaId).toBe(area);
          expect(new Date(result!.updatedAt).toISOString()).toBe('2026-09-19T00:00:00.000Z');
          expect((await reader.getTodayTasks('2026-09-19T00:00:00Z'))[0].status).toBe('waiting');
          await tx.delete(schema.areas).where(eq(schema.areas.id, area));
          expect((await reader.getProjectBySlug('project'))?.areaId).toBeNull();
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await createReadQueries(connection.db).getProjects()).toEqual([]);
    } finally {
      await connection.close();
    }
  },
  30_000,
);
