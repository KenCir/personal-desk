// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('initial PostgreSQL migration', () => {
  it('applies all tables, enforces constraints, and retains history on deletion', async () => {
    const db = new PGlite();
    try {
      const sql = readFileSync(
        new URL('../drizzle/0000_cuddly_oracle.sql', import.meta.url),
        'utf8',
      );
      await db.exec(sql);
      const tables = await db.query<{ count: number }>(
        "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
      );
      expect(tables.rows[0].count).toBe(13);
      const badTimestamps = await db.query(
        "select column_name from information_schema.columns where table_schema='public' and column_name like '%_at' and data_type <> 'timestamp with time zone'",
      );
      expect(badTimestamps.rows).toEqual([]);
      const staleEnums = await db.query("select enumlabel from pg_enum where enumlabel='stale'");
      expect(staleEnums.rows).toEqual([]);
      const area = '00000000-0000-4000-8000-000000000001';
      const project = '00000000-0000-4000-8000-000000000002';
      const activity = '00000000-0000-4000-8000-000000000003';
      await db.query(
        "insert into areas(id, provider, external_id, name, slug) values ($1,'notion','area-1','Area','area')",
        [area],
      );
      await db.query(
        "insert into projects(id,provider,external_id,area_id,slug,name,meaningful_updated_at) values ($1,'notion','project-1',$2,'desk','Desk',now())",
        [project, area],
      );
      await db.query(
        "insert into activities(id,project_id,provider,dedup_key,type,category,importance,title,occurred_at) values ($1,$2,'github','event-1','pr.merged','source_control','normal','PR merged',now())",
        [activity, project],
      );
      await expect(
        db.query(
          "insert into projects(id,provider,external_id,slug,name,meaningful_updated_at) values ('00000000-0000-4000-8000-000000000004','notion','project-1','other','Other',now())",
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "insert into systems(id,name,slug,status) values ('00000000-0000-4000-8000-000000000005','VPS','vps','stale')",
        ),
      ).rejects.toThrow();
      await db.query('delete from areas where id=$1', [area]);
      expect(
        (await db.query<{ area_id: string | null }>('select area_id from projects')).rows[0]
          .area_id,
      ).toBeNull();
      await db.query('delete from projects where id=$1', [project]);
      expect(
        (await db.query<{ project_id: string | null }>('select project_id from activities')).rows[0]
          .project_id,
      ).toBeNull();
    } finally {
      await db.close();
    }
  }, 30_000);
});
