import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Only creates new files. Never rotates a password in an existing PostgreSQL volume. */
export function provision(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const password = () => randomBytes(32).toString('hex');
  const admin = password();
  const files = {
    postgres_password: admin,
    admin_database_url: `postgresql://personal_desk:${admin}@postgres:5432/personal_desk`,
    web_database_url: `postgresql://desk_web:${password()}@postgres:5432/personal_desk`,
    worker_database_url: `postgresql://desk_worker:${password()}@postgres:5432/personal_desk`,
  };
  if (Object.keys(files).some((name) => existsSync(resolve(directory, name))))
    throw new Error('secret_files_already_exist');
  for (const [name, value] of Object.entries(files))
    writeFileSync(resolve(directory, name), value + '\n', { flag: 'wx', mode: 0o600 });
}
if (process.argv[1]?.endsWith('provision.mjs')) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/docker/provision.mjs NEW_SECRET_DIRECTORY');
    process.exit(1);
  }
  try {
    provision(resolve(process.argv[2]));
    console.log(
      'Created DB secrets. Set file ownership for container UID 1000 before use. Add notion_token separately.',
    );
  } catch {
    console.error(
      'Provision failed. Existing files were not overwritten; inspect partial output before retrying.',
    );
    process.exitCode = 1;
  }
}
