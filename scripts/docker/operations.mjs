import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readFileSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';

// Host-side operations: no shell interpolation and no implicit .env fallback.
const [operation, argument] = process.argv.slice(2);
const project = process.env.DESK_PROJECT ?? 'personal-desk-prod';
const envFile = process.env.DESK_ENV_FILE;
const secretDir = process.env.PROD_SECRET_DIR ?? '/etc/personal-desk/secrets';
const release = process.env.RELEASE_TAG;
if (
  !/^(personal-desk-prod|desk-test-[a-z0-9-]+|desk-restore-[a-z0-9-]+)$/.test(project) ||
  !envFile ||
  !existsSync(envFile)
) {
  console.error('Set DESK_ENV_FILE and an allowed DESK_PROJECT explicitly.');
  process.exit(1);
}
const base = ['compose', '--env-file', resolve(envFile), '-p', project, '-f', 'compose.prod.yaml'];
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error('docker_operation_failed');
  return result.stdout;
}
function exec(args, options) {
  return docker([...base, 'exec', '-T', 'postgres', ...args], options);
}
function query(text) {
  return exec(
    [
      'psql',
      '-X',
      '-U',
      'personal_desk',
      '-d',
      'personal_desk',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      text,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  ).trim();
}
function assertPostgres() {
  const containers = docker([...base, 'ps', '-q', 'postgres'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();
  if (!containers || containers.includes('\n')) throw new Error('single_postgres_required');
  const [container] = JSON.parse(
    docker(['inspect', containers], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }),
  );
  if (
    container.Config.Labels['com.docker.compose.project'] !== project ||
    container.Config.Labels['com.docker.compose.service'] !== 'postgres'
  )
    throw new Error('wrong_project');
  const version = query(
    "select current_database() || ':' || current_user || ':' || current_setting('server_version_num')",
  );
  if (!/^personal_desk:personal_desk:18\d{4}$/.test(version)) throw new Error('wrong_database');
  return version;
}
async function checksum(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
try {
  if (operation === 'migrate' || operation === 'roles') {
    if (!release || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(release))
      throw new Error('release_required');
    assertPostgres();
    const workers = docker(
      [
        'ps',
        '--filter',
        `label=com.docker.compose.project=${project}`,
        '--filter',
        'label=com.docker.compose.service=worker',
        '--format',
        '{{.ID}}',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      },
    ).trim();
    if (workers) throw new Error('stop_worker_before_maintenance');
    const [network] = JSON.parse(
      docker(['network', 'inspect', `${project}_database`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      }),
    );
    if (network.Labels['com.docker.compose.project'] !== project || !network.Internal)
      throw new Error('wrong_database_network');
    const mounts = [
      'admin_database_url',
      ...(operation === 'roles' ? ['web_database_url', 'worker_database_url'] : []),
    ];
    for (const name of mounts)
      if (!statSync(resolve(secretDir, name)).isFile()) throw new Error('secret_missing');
    const mountArgs = mounts.flatMap((name) => [
      '--mount',
      `type=bind,src=${resolve(secretDir, name)},dst=/run/secrets/${name},readonly`,
    ]);
    docker([
      'run',
      '--rm',
      '--init',
      '--network',
      `${project}_database`,
      ...mountArgs,
      '-e',
      'DATABASE_URL_FILE=/run/secrets/admin_database_url',
      '-e',
      'WEB_DATABASE_URL_FILE=/run/secrets/web_database_url',
      '-e',
      'WORKER_DATABASE_URL_FILE=/run/secrets/worker_database_url',
      `personal-desk/maintenance:${release}`,
      operation,
    ]);
  } else if (operation === 'backup') {
    const version = assertPostgres();
    const migrations = query('select hash from drizzle.__drizzle_migrations order by created_at');
    if (!argument) throw new Error('backup_path_required');
    const path = resolve(argument);
    const descriptor = openSync(path, 'wx', 0o600);
    try {
      exec(['pg_dump', '-U', 'personal_desk', '-d', 'personal_desk', '-Fc'], {
        stdio: ['ignore', descriptor, 'inherit'],
      });
    } finally {
      closeSync(descriptor);
    }
    const input = openSync(path, 'r');
    try {
      exec(['pg_restore', '--list'], { stdio: [input, 'ignore', 'inherit'] });
    } finally {
      closeSync(input);
    }
    if (query('select hash from drizzle.__drizzle_migrations order by created_at') !== migrations)
      throw new Error('schema_changed_during_backup');
    writeFileSync(
      `${path}.json`,
      JSON.stringify(
        {
          version,
          project,
          release: release ?? null,
          createdAt: new Date().toISOString(),
          bytes: statSync(path).size,
          sha256: await checksum(path),
          migrations,
        },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      'Backup archive verified; retain its manifest and perform an isolated restore rehearsal.',
    );
  } else if (operation === 'restore') {
    // Intentionally cannot restore over the production project, even with confirmation.
    if (!project.startsWith('desk-restore-') || !argument)
      throw new Error('isolated_restore_project_required');
    assertPostgres();
    if (
      query(
        `select
          (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') +
          (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') +
          (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') +
          (select count(*) from pg_namespace where nspname !~ '^pg_' and nspname not in ('public', 'information_schema')) +
          (select count(*) from pg_largeobject_metadata)`,
      ) !== '0'
    )
      throw new Error('restore_requires_empty_database');
    const path = resolve(argument);
    const manifest = JSON.parse(readFileSync(`${path}.json`, 'utf8'));
    if ((await checksum(path)) !== manifest.sha256) throw new Error('checksum_mismatch');
    const input = openSync(path, 'r');
    try {
      exec(
        [
          'pg_restore',
          '-U',
          'personal_desk',
          '-d',
          'personal_desk',
          '--exit-on-error',
          '--single-transaction',
          '--no-owner',
          '--no-acl',
        ],
        { stdio: [input, 'inherit', 'inherit'] },
      );
    } finally {
      closeSync(input);
    }
    if (
      query('select hash from drizzle.__drizzle_migrations order by created_at') !==
      manifest.migrations
    )
      throw new Error('migration_history_mismatch');
    console.log(
      'Restore completed into isolated project; run roles and read/sync checks before any cutover.',
    );
  } else {
    throw new Error('use_migrate_roles_backup_or_restore');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
