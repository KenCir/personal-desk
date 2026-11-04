import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readSecret, validateDatabaseUrl } from './secrets.mjs';

const require = createRequire(new URL('../../packages/database/package.json', import.meta.url));
const postgres = require('postgres').default;
const command = process.argv[2];
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5, onnotice: () => {} });
try {
  const [identity] = await sql`select current_database() as db, current_user as role`;
  if (identity.db !== 'personal_desk' || identity.role !== 'personal_desk') throw new Error();
  if (command === 'migrate') {
    const result = spawnSync('pnpm', ['db:migrate'], { stdio: 'inherit', env: process.env });
    if (result.status !== 0) throw new Error();
  } else if (command === 'roles') {
    const urls = [
      ['desk_web', readSecret(process.env, 'WEB_DATABASE_URL')],
      ['desk_worker', readSecret(process.env, 'WORKER_DATABASE_URL')],
    ];
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(168398833, 3)`;
      for (const [name, value] of urls) {
        const url = validateDatabaseUrl(value);
        if (url.username !== name) throw new Error();
        const password = decodeURIComponent(url.password);
        if (!password || /[\r\n\0]/.test(password)) throw new Error();
        const existing = await tx`select oid from pg_roles where rolname = ${name}`;
        if (existing.length) {
          const memberships =
            await tx`select 1 from pg_auth_members where member = ${existing[0].oid}`;
          if (memberships.length) throw new Error();
        } else {
          await tx.unsafe(`CREATE ROLE "${name}" LOGIN`);
        }
        // Identifiers are fixed above. Password is a quoted SQL literal, never a CLI argument.
        const literal = "'" + password.replaceAll("'", "''").replaceAll('\\', '\\\\') + "'";
        await tx.unsafe(
          `ALTER ROLE "${name}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD E${literal}`,
        );
      }
      await tx.unsafe(`
        REVOKE ALL ON DATABASE personal_desk FROM PUBLIC;
        GRANT CONNECT ON DATABASE personal_desk TO desk_web, desk_worker;
        REVOKE ALL ON SCHEMA public FROM PUBLIC;
        GRANT USAGE ON SCHEMA public, drizzle TO desk_web, desk_worker;
        REVOKE ALL ON ALL TABLES IN SCHEMA public, drizzle FROM desk_web, desk_worker;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, drizzle FROM desk_web, desk_worker;
        GRANT SELECT ON ALL TABLES IN SCHEMA public, drizzle TO desk_web, desk_worker;
        GRANT INSERT, UPDATE ON areas, projects, tasks, milestones, resources, activities,
          integrations, sync_runs, integration_cursors TO desk_worker;
        ALTER DEFAULT PRIVILEGES FOR ROLE personal_desk IN SCHEMA public
          REVOKE ALL ON TABLES FROM desk_web, desk_worker;
        ALTER DEFAULT PRIVILEGES FOR ROLE personal_desk IN SCHEMA public
          REVOKE ALL ON SEQUENCES FROM desk_web, desk_worker;
        ALTER DEFAULT PRIVILEGES FOR ROLE personal_desk IN SCHEMA public
          GRANT SELECT ON TABLES TO desk_web, desk_worker;
      `);
    });
  } else {
    throw new Error();
  }
  console.log(JSON.stringify({ status: 'success', operation: command }));
} catch {
  console.error(JSON.stringify({ status: 'failed', error: 'maintenance_failed' }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
