// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase, withNotionSession } from '@personal-desk/database';
import * as s from '@personal-desk/database/schema';
import {
  fixtureCollection,
  fixturePages,
  fixtureSchemas,
  ids,
  time,
  later,
  status,
} from './fixtures';
import { defaultMapping } from './config';
import { object, type SourceKind } from './types';
import { synchronize } from './sync';
import { runNotionSync } from './runtime';

// No .env or DATABASE_URL fallback. Never mutate the database used by the empty-DB E2E.
const testUrl = process.env.POSTGRES_TEST_URL;
describe.skipIf(!testUrl)('Notion sync on disposable PostgreSQL 18', () => {
  let admin: ReturnType<typeof createDatabase>;
  let connection: ReturnType<typeof createDatabase>;
  let url: string;
  let databaseCreated = false;
  const name = `personal_desk_notion_ci_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  beforeAll(async () => {
    const target = new URL(testUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      target.pathname !== '/personal_desk_ci'
    )
      throw new Error('POSTGRES_TEST_URL must target disposable local personal_desk_ci');
    admin = createDatabase(testUrl!);
    const version = await admin.db.execute(sql`show server_version_num`);
    expect(Math.floor(Number(version[0].server_version_num) / 10000)).toBe(18);
    await admin.db.execute(sql`create database ${sql.identifier(name)}`);
    databaseCreated = true;
    target.pathname = `/${name}`;
    url = target.toString();
    connection = createDatabase(url);
    await migrate(connection.db, {
      migrationsFolder: fileURLToPath(new URL('../../../database/drizzle', import.meta.url)),
    });
  }, 30000);
  beforeEach(async () => {
    await connection.db.execute(
      sql`truncate areas, projects, tasks, milestones, resources, activities, integrations, sync_runs cascade`,
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await connection?.close();
    if (databaseCreated)
      await admin.db.execute(sql`drop database ${sql.identifier(name)} with (force)`);
    await admin?.close();
  });

  it('holds a provider-wide session lock without an open transaction during collection', async () => {
    await withNotionSession(url, async ({ db, assertHeld }) => {
      const [{ pid }] = await db.execute(sql`select pg_backend_pid() as pid`);
      const report = await synchronize({
        db,
        ids,
        dryRun: false,
        assertHeld,
        clock: () => time,
        collect: async () => {
          const [session] = await connection.db.execute(
            sql`select state, xact_start from pg_stat_activity where pid = ${pid}`,
          );
          expect(session.state).toBe('idle');
          expect(session.xact_start).toBeNull();
          await expect(withNotionSession(url, async () => undefined)).rejects.toThrow(
            'notion_sync_busy',
          );
          return fixtureCollection();
        },
      });
      expect(report.status).toBe('success');
    });
    await withNotionSession(url, async ({ assertHeld }) => {
      await assertHeld();
    });
  });

  it('aborts all saving after the lock connection is terminated, then recovers the interrupted run', async () => {
    await withNotionSession(url, async ({ db, assertHeld }) => {
      const [{ pid }] = await db.execute(sql`select pg_backend_pid() as pid`);
      const report = await synchronize({
        db,
        ids,
        dryRun: false,
        assertHeld,
        clock: () => time,
        collect: async () => {
          await connection.db.execute(sql`select pg_terminate_backend(${pid})`);
          return fixtureCollection();
        },
      });
      expect(report.status).toBe('failed');
    });
    expect(await connection.db.select().from(s.projects)).toEqual([]);
    expect(await connection.db.select().from(s.integrationCursors)).toEqual([]);
    expect((await connection.db.select().from(s.syncRuns))[0].status).toBe('running');
    await withNotionSession(url, async ({ db, assertHeld }) => {
      expect(
        (
          await synchronize({
            db,
            ids,
            dryRun: false,
            assertHeld,
            clock: () => later,
            collect: async () => fixtureCollection(),
          })
        ).status,
      ).toBe('success');
    });
    expect((await connection.db.select().from(s.syncRuns)).map((row) => row.status).sort()).toEqual(
      ['failed', 'success'],
    );
  });

  it('checks lock ownership inside the saving transaction, even if the connection is alive', async () => {
    await withNotionSession(url, async ({ db, assertHeld }) => {
      const report = await synchronize({
        db,
        ids,
        dryRun: false,
        assertHeld,
        clock: () => time,
        collect: async () => {
          await db.execute(sql`select pg_advisory_unlock_all()`);
          return fixtureCollection();
        },
      });
      expect(report.status).toBe('failed');
      expect(report.issues).toEqual([{ code: 'notion_lock_lost' }]);
    });
    expect(await connection.db.select().from(s.projects)).toEqual([]);
  });

  it('manual CLI and Worker share the same runtime lock before any Notion request', async () => {
    let entered!: () => void;
    let release!: () => void;
    const collecting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pages = fixturePages();
    const schemas = fixtureSchemas();
    const fetch = vi.fn(async (input: string, init: RequestInit) => {
      entered();
      await gate;
      const kind = Object.entries(ids).find(([, id]) => input.includes(id))![0] as SourceKind;
      if (input.endsWith('/query')) {
        const body = JSON.parse(init.body as string);
        return Response.json({
          results: body.is_archived ? [] : pages[kind],
          has_more: false,
          next_cursor: null,
        });
      }
      const schema = schemas.find((row) => row.source === kind)!;
      return Response.json({
        object: 'data_source',
        id: ids[kind],
        properties: Object.fromEntries(
          schema.properties.map((p) => [
            p.name,
            {
              id: p.id,
              type: p.type,
              [p.type]: p.options
                ? { options: p.options.map((name) => ({ name })) }
                : p.relationDataSourceId
                  ? {
                      relationDataSourceId: p.relationDataSourceId,
                      data_source_id: p.relationDataSourceId,
                    }
                  : {},
            },
          ]),
        ),
      });
    });
    vi.stubGlobal('fetch', fetch);
    const target = new URL(url);
    const options = {
      url,
      target: `${target.hostname}:${target.port || '5432'}/${name}`,
      token: 'fixture-only',
      ids,
      mapping: defaultMapping,
      dryRun: false,
    };
    const manual = runNotionSync({ ...options, trigger: 'manual' });
    try {
      await collecting;
      const worker = await runNotionSync({ ...options, trigger: 'worker', mode: 'incremental' });
      expect(worker.status).toBe('skipped');
      expect('reason' in worker && worker.reason).toBe('busy');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
    expect((await manual).status).toBe('success');
    expect(await connection.db.select().from(s.activities)).toEqual([]);
  }, 15000);

  it('commits activities and watermarks atomically and replays idempotently on PostgreSQL', async () => {
    const sync = (pages = fixturePages(), clock = time) =>
      withNotionSession(url, ({ db, assertHeld }) =>
        synchronize({
          db,
          ids,
          dryRun: false,
          assertHeld,
          clock: () => clock,
          collect: async () => fixtureCollection(pages),
        }),
      );
    expect((await sync()).status).toBe('success');
    const before = await connection.db.select().from(s.integrationCursors);
    const pages = fixturePages();
    object(pages.projects[0].properties).Status = status('Done');
    pages.projects[0].last_edited_time = later;
    await connection.db.execute(
      sql`alter table activities add constraint reject_test_activity check (type <> 'project.completed')`,
    );
    try {
      expect((await sync(pages, later)).status).toBe('failed');
      expect((await connection.db.select().from(s.projects))[0].status).toBe('active');
      expect(await connection.db.select().from(s.integrationCursors)).toEqual(before);
    } finally {
      await connection.db.execute(sql`alter table activities drop constraint reject_test_activity`);
    }
    expect((await sync(pages, later)).status).toBe('success');
    expect((await sync(pages, later)).status).toBe('success');
    expect(await connection.db.select().from(s.activities)).toHaveLength(1);
  });
});
