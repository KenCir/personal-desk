import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { provision } from '../docker/provision.mjs';

// A fresh project per invocation. No personal env file or production credentials are read.
const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
const project = `desk-test-${id}`;
const restoreProject = `desk-restore-${id}`;
const directory = mkdtempSync(join(tmpdir(), 'desk-docker-'));
const secrets = join(directory, 'secrets');
const envFile = join(directory, 'compose.env');
const override = join(directory, 'fixture.json');
const revision = process.env.DESK_BUILD_REVISION;
if (revision) assert.match(revision, /^[0-9a-f]{40}$/);
const release = revision ? `sha-${revision}` : `test-${id}`;
const artifactDir = resolve('test-results/docker');
mkdirSync(artifactDir, { recursive: true });
const engine = spawnSync('docker', ['version'], { encoding: 'utf8', windowsHide: true });
if (engine.error || engine.status !== 0) {
  const reason = engine.error?.code ?? 'docker_engine_unavailable';
  writeFileSync(
    join(artifactDir, 'result.json'),
    JSON.stringify({ success: false, unavailable: true, reason, evidence: [] }, null, 2),
  );
  console.error(`Docker validation not executed: ${reason}`);
  process.exit(1);
}
provision(secrets);
writeFileSync(join(secrets, 'notion_token'), 'fixture-only\n', { mode: 0o600 });
// Public, disposable CI credentials: readable by the image's non-root UID on any runner.
for (const file of readdirSync(secrets)) chmodSync(join(secrets, file), 0o444);
const secretValues = new Set();
for (const file of readdirSync(secrets)) {
  const value = readFileSync(join(secrets, file), 'utf8').trim();
  secretValues.add(value);
  try {
    const password = decodeURIComponent(new URL(value).password);
    if (password) secretValues.add(password);
  } catch {
    /* not a URL */
  }
}
const containsSecret = (text) => [...secretValues].some((value) => text.includes(value));
const redact = (text) => {
  for (const value of secretValues) text = text.replaceAll(value, '[REDACTED]');
  return text;
};
let commandLeak = false;
copyFileSync('notion.mapping.example.json', join(directory, 'notion.mapping.json'));
writeFileSync(envFile, '');
const env = {
  ...process.env,
  RELEASE_TAG: release,
  PROD_SECRET_DIR: secrets,
  PROD_CONFIG_DIR: directory,
  WEB_PORT: '0',
  NOTION_WORKER_ENABLED: 'false',
  COMPOSE_PROFILES: '',
  NOTION_AREAS_DATA_SOURCE_ID: '00000000-0000-4000-8000-000000000100',
  NOTION_PROJECTS_DATA_SOURCE_ID: '00000000-0000-4000-8000-000000000200',
  NOTION_TASKS_DATA_SOURCE_ID: '00000000-0000-4000-8000-000000000300',
  DESK_ENV_FILE: envFile,
  DESK_PROJECT: project,
};
const workerArgs = [
  '--import',
  '/app/scripts/docker/preload.mjs',
  '--import',
  'tsx',
  '--import',
  '/app/scripts/ci/notion-fixture.ts',
  'src/main.ts',
];
writeFileSync(
  override,
  JSON.stringify({
    services: {
      worker: {
        entrypoint: ['node'],
        command: workerArgs,
        environment: { DESK_DOCKER_TEST: 'true', NOTION_WORKER_ENABLED: 'true' },
      },
    },
  }),
);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  commandLeak ||= containsSecret(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr ?? ''}\n${result.stdout ?? ''}`,
    );
  }
  return result.stdout?.trim() ?? '';
}
const base = (name = project) => [
  'compose',
  '--env-file',
  envFile,
  '-p',
  name,
  '-f',
  'compose.prod.yaml',
];
const dc = (...args) => run('docker', [...base(), ...args]);
const query = (text, name = project) =>
  run('docker', [
    ...base(name),
    'exec',
    '-T',
    'postgres',
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
  ]);
const operations = (operation, argument, name = project) =>
  run(
    process.execPath,
    ['scripts/docker/operations.mjs', operation, ...(argument ? [argument] : [])],
    { env: { ...env, DESK_PROJECT: name } },
  );
const inspect = (container) => JSON.parse(run('docker', ['inspect', container]))[0];
async function until(check, label, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(1000);
  }
  throw new Error(`Timed out: ${label}`);
}
const snapshot = () =>
  query(
    "select json_build_object('projects', (select json_agg(id order by id) from projects), 'tasks', (select json_agg(id order by id) from tasks), 'activities', (select json_agg(dedup_key order by dedup_key) from activities), 'cursor', (select json_agg(integration_id order by integration_id) from integration_cursors))",
  );
function databaseSnapshot(name = project, includeRuns = true) {
  const tables = [
    'areas',
    'projects',
    'tasks',
    'milestones',
    'resources',
    'activities',
    'systems',
    'services',
    'backups',
    'alerts',
    'integrations',
    'sync_runs',
    'integration_cursors',
  ];
  // Fixed identifiers only. Include all values, not merely row counts or primary keys.
  const fields = tables
    .filter((table) => includeRuns || !['integrations', 'sync_runs'].includes(table))
    .map(
      (table) =>
        `'${table}', (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) from ${table} t)`,
    );
  fields.push(
    "'migrations', (select jsonb_agg(to_jsonb(t) order by created_at) from drizzle.__drizzle_migrations t)",
  );
  return query(`select jsonb_build_object(${fields.join(',')})`, name);
}
function cleanup(name) {
  const volume = `${name}_postgres18_data`;
  run('docker', [...base(name), '--profile', 'worker', 'down', '--remove-orphans']);
  const result = spawnSync('docker', ['volume', 'inspect', volume], { env, encoding: 'utf8' });
  if (result.status === 0) {
    const [data] = JSON.parse(result.stdout);
    assert.equal(data.Labels['com.docker.compose.project'], name);
    assert.ok(name === project || name === restoreProject);
    run('docker', ['volume', 'rm', volume]);
  }
}

const evidence = [];
try {
  run('docker', ['version']);
  run('docker', ['compose', 'version']);
  const config = JSON.parse(dc('--profile', 'worker', 'config', '--format', 'json'));
  assert.deepEqual(Object.keys(config.services).sort(), ['postgres', 'web', 'worker']);
  assert.equal((config.services.postgres.ports ?? []).length, 0);
  assert.deepEqual(config.services.worker.profiles, ['worker']);
  assert.equal(config.services.worker.restart, 'no');
  assert.equal(config.services.worker.environment.NOTION_WORKER_ENABLED, 'false');
  assert.equal(config.networks.database.internal, true);
  evidence.push('Compose config validated; DB unpublished; Worker opt-in');
  for (const role of ['web', 'worker', 'maintenance']) {
    const image = `ghcr.io/kencir/personal-desk-${role}:${release}`;
    if (role !== 'maintenance') {
      assert.equal(config.services[role].image, image);
      assert.equal(config.services[role].build, undefined);
    }
    run('docker', [
      'buildx',
      'build',
      '--load',
      '--provenance=false',
      '--file',
      role === 'web' ? 'apps/web/Dockerfile' : 'apps/worker/Dockerfile',
      '--target',
      role === 'maintenance' ? role : 'runtime',
      '--label',
      'org.opencontainers.image.source=https://github.com/KenCir/personal-desk',
      '--label',
      `org.opencontainers.image.revision=${revision ?? 'local'}`,
      '--tag',
      image,
      '.',
    ]);
  }
  evidence.push('Web/Worker/maintenance images built');
  for (const role of ['web', 'worker', 'maintenance']) {
    const image = `ghcr.io/kencir/personal-desk-${role}:${release}`;
    const [metadata] = JSON.parse(run('docker', ['image', 'inspect', image]));
    assert.equal(metadata.Config.User, 'node');
    assert.equal(run('docker', ['run', '--rm', '--entrypoint', 'id', image, '-u']), '1000');
    assert.ok(!containsSecret(JSON.stringify(metadata)), 'image metadata secret leak');
    assert.ok(
      !containsSecret(run('docker', ['history', '--no-trunc', image])),
      'image history secret leak',
    );
  }
  evidence.push('All image targets run as UID 1000; metadata/history contain no generated secrets');
  dc('up', '-d', '--wait', 'postgres');
  operations('migrate');
  operations('migrate');
  operations('roles');
  evidence.push('Migration applied twice; roles configured');
  assert.equal(
    query(
      "select has_table_privilege('desk_web','projects','SELECT') and not has_table_privilege('desk_web','projects','INSERT') and not has_schema_privilege('desk_web','public','CREATE')",
    ),
    't',
  );
  assert.equal(
    query(
      "select has_table_privilege('desk_worker','projects','INSERT') and not has_table_privilege('desk_worker','projects','DELETE') and not has_table_privilege('desk_worker','drizzle.__drizzle_migrations','INSERT')",
    ),
    't',
  );
  dc('up', '-d', '--wait');
  assert.equal(dc('ps', '-a', '-q', 'worker'), '');
  const web = dc('ps', '-q', 'web');
  const postgres = dc('ps', '-q', 'postgres');
  assert.equal(inspect(web).Config.User, 'node');
  assert.equal(Object.keys(inspect(postgres).HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(inspect(web).HostConfig.Memory, 512 * 1024 ** 2);
  assert.equal(inspect(postgres).HostConfig.Memory, 768 * 1024 ** 2);
  run('docker', [
    'exec',
    '-w',
    '/app/apps/web',
    web,
    'node',
    '-e',
    "const r = require('node:module').createRequire(require.resolve('next/package.json')); r('sharp')({create:{width:1,height:1,channels:3,background:'white'}}).png().toBuffer().catch(() => process.exit(1))",
  ]);
  const imageProbe =
    "const fs=require('fs');if(fs.existsSync('/app/.env')||fs.existsSync('/app/notion.mapping.json'))process.exit(1)";
  run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'node',
    `ghcr.io/kencir/personal-desk-web:${release}`,
    '-e',
    imageProbe,
  ]);
  run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'node',
    `ghcr.io/kencir/personal-desk-worker:${release}`,
    '-e',
    imageProbe,
  ]);
  let port = dc('port', 'web', '3000').split(':').at(-1);
  let origin = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${origin}/api/health/live`)).status, 200);
  assert.equal((await fetch(`${origin}/api/health/ready`)).status, 200);
  const html = await (await fetch(`${origin}/`)).text();
  assert.ok(html.includes('Google Calendar'));
  const asset = html.match(/src="([^" ]*\/_next\/static\/[^" ]+)"/);
  assert.ok(asset, 'standalone static asset reference');
  assert.equal((await fetch(new URL(asset[1].replaceAll('&amp;', '&'), origin))).status, 200);
  evidence.push('Web ready, DB read role works, static assets served; no default Worker');

  const disabled = spawnSync(
    'docker',
    [...base(), 'run', '--rm', '--no-deps', 'worker', '--once'],
    { env, encoding: 'utf8' },
  );
  assert.notEqual(disabled.status, 0);
  assert.ok(disabled.stdout.includes('notion_worker_disabled'));
  assert.equal(query('select count(*) from sync_runs'), '0');
  const once = () =>
    dc(
      'run',
      '--rm',
      '--no-deps',
      '--entrypoint',
      'node',
      '-e',
      'DESK_DOCKER_TEST=true',
      '-e',
      'NOTION_WORKER_ENABLED=true',
      'worker',
      ...workerArgs,
      '--once',
    );
  assert.ok(once().includes('"status":"success"'));
  const stable = snapshot();
  assert.ok(once().includes('"status":"success"'));
  assert.equal(snapshot(), stable);
  assert.equal(query('select count(*) from projects'), '1');
  assert.equal(query('select count(*) from activities'), '0');
  evidence.push(
    'Disabled Worker rejects writes; real Worker with fixture fetch syncs twice idempotently',
  );

  run('docker', [...base(), '-f', override, '--profile', 'worker', 'up', '-d', 'worker']);
  const worker = dc('ps', '-q', 'worker');
  await until(() => inspect(worker).State.Health?.Status === 'healthy', 'Worker heartbeat');
  dc('--profile', 'worker', 'stop', 'worker');
  assert.equal(inspect(worker).State.ExitCode, 0);
  assert.equal(inspect(worker).HostConfig.RestartPolicy.Name, 'no');
  assert.equal(query('select pg_try_advisory_lock(168398833, 2)'), 't');
  evidence.push(
    'Scheduled Worker heartbeat and SIGTERM verified, lock released, restart policy disabled',
  );

  // Abort during collection, then repeat with SIGKILL: neither may partially persist entities.
  const waiting = JSON.parse(readFileSync(override, 'utf8'));
  waiting.services.worker.environment.DESK_FIXTURE_WAIT = 'true';
  writeFileSync(override, JSON.stringify(waiting));
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    run('docker', [
      ...base(),
      '-f',
      override,
      '--profile',
      'worker',
      'up',
      '-d',
      '--force-recreate',
      'worker',
    ]);
    const active = dc('ps', '-q', 'worker');
    await until(
      () =>
        query(
          "select count(*) from pg_locks where locktype='advisory' and classid=168398833 and objid=2 and granted",
        ) === '1',
      'Worker collecting lock',
    );
    if (signal === 'SIGTERM') dc('--profile', 'worker', 'stop', 'worker');
    else dc('--profile', 'worker', 'kill', '-s', signal, 'worker');
    assert.equal(inspect(active).State.Running, false);
    assert.equal(snapshot(), stable);
    assert.equal(query('select pg_try_advisory_lock(168398833, 2)'), 't');
    assert.ok(once().includes('"status":"success"'));
    assert.equal(snapshot(), stable);
    assert.equal(query("select count(*) from sync_runs where status='running'"), '0');
  }
  evidence.push(
    'SIGTERM/SIGKILL during collection release lock and recover without partial entities or duplicate activity',
  );

  // Pause an actual save transaction, not just API collection, to exercise both termination paths.
  waiting.services.worker.environment.DESK_FIXTURE_WAIT = 'false';
  writeFileSync(override, JSON.stringify(waiting));
  query(`create function docker_test_pause_save() returns trigger language plpgsql as $$
    begin perform pg_sleep(8); return new; end $$;
    create trigger docker_test_pause_save before update on projects
    for each row execute function docker_test_pause_save()`);
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    const beforeEntities = databaseSnapshot(project, false);
    const successes = Number(query("select count(*) from sync_runs where status='success'"));
    run('docker', [
      ...base(),
      '-f',
      override,
      '--profile',
      'worker',
      'up',
      '-d',
      '--force-recreate',
      'worker',
    ]);
    const active = dc('ps', '-q', 'worker');
    await until(
      () =>
        query(
          "select count(*) from pg_stat_activity where usename='desk_worker' and wait_event='PgSleep'",
        ) === '1',
      'Worker saving transaction',
    );
    if (signal === 'SIGTERM') {
      dc('--profile', 'worker', 'stop', 'worker');
      assert.equal(inspect(active).State.ExitCode, 0);
      assert.equal(
        Number(query("select count(*) from sync_runs where status='success'")),
        successes + 1,
      );
      assert.equal(query("select count(*) from sync_runs where status='running'"), '0');
    } else {
      dc('--profile', 'worker', 'kill', '-s', signal, 'worker');
    }
    await until(
      () =>
        query(
          "select count(*) from pg_locks where locktype='advisory' and classid=168398833 and objid=2 and granted",
        ) === '0',
      'save session lock release',
    );
    if (signal === 'SIGKILL') assert.equal(databaseSnapshot(project, false), beforeEntities);
  }
  query('drop trigger docker_test_pause_save on projects; drop function docker_test_pause_save()');
  assert.ok(once().includes('"status":"success"'));
  assert.equal(snapshot(), stable);
  assert.equal(query("select count(*) from sync_runs where status='running'"), '0');
  evidence.push(
    'SIGTERM during save drains to atomic commit; SIGKILL rolls back entity/cursor changes and next run recovers',
  );

  dc('stop', 'postgres');
  assert.equal((await fetch(`${origin}/api/health/ready`)).status, 503);
  assert.equal((await fetch(`${origin}/api/health/live`)).status, 200);
  dc('up', '-d', '--wait', 'postgres');
  await until(
    async () => (await fetch(`${origin}/api/health/ready`)).status === 200,
    'DB recovery',
  );
  const persisted = databaseSnapshot();
  dc('--profile', 'worker', 'down'); // Keep the named volume.
  dc('up', '-d', '--wait');
  assert.equal(snapshot(), stable);
  assert.equal(databaseSnapshot(), persisted);
  assert.equal(dc('ps', '-a', '-q', 'worker'), '');
  port = dc('port', 'web', '3000').split(':').at(-1);
  origin = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${origin}/api/health/ready`)).status, 200);
  evidence.push('DB failure/recovery and named-volume down/up persistence verified');

  const archive = join(directory, 'database.dump');
  operations('backup', archive);
  run('docker', [...base(restoreProject), 'up', '-d', '--wait', 'postgres']);
  operations('restore', archive, restoreProject);
  operations('roles', undefined, restoreProject);
  assert.equal(databaseSnapshot(restoreProject), databaseSnapshot());
  assert.equal(query('select count(*) from projects', restoreProject), '1');
  assert.equal(query('select count(*) from integration_cursors', restoreProject), '1');
  assert.equal(
    query('select hash from drizzle.__drizzle_migrations order by created_at', restoreProject),
    query('select hash from drizzle.__drizzle_migrations order by created_at'),
  );
  // Restore cannot be run over an existing DB or production by the operations wrapper.
  const secondRestore = spawnSync(
    process.execPath,
    ['scripts/docker/operations.mjs', 'restore', archive],
    { env: { ...env, DESK_PROJECT: restoreProject }, encoding: 'utf8' },
  );
  assert.notEqual(secondRestore.status, 0);
  evidence.push(
    'Backup manifest/checksum and isolated restore verified; nonempty restore rejected',
  );
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  // Capture only service output from synthetic credentials; never dump config or env.
  const logs = spawnSync('docker', [...base(), '--profile', 'worker', 'logs', '--no-color'], {
    env,
    encoding: 'utf8',
  });
  const output = `${logs.stdout ?? ''}\n${logs.stderr ?? ''}`;
  if (logs.error || logs.status !== 0 || commandLeak || containsSecret(output)) {
    console.error('Log collection failed or generated secret detected in command/service output');
    process.exitCode = 1;
  } else {
    evidence.push('Command output and service logs contain no generated secrets');
  }
  writeFileSync(join(artifactDir, 'services.log'), redact(output));
  for (const name of [project, restoreProject]) {
    try {
      cleanup(name);
    } catch (error) {
      console.error(`Cleanup failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
  writeFileSync(
    join(artifactDir, 'result.json'),
    JSON.stringify({ success: !process.exitCode, evidence }, null, 2),
  );
}
