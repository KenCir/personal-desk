import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { provision } from './provision.mjs';

test('actual preload injects a file secret before application startup and fails closed without leaking it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'desk-preload-'));
  try {
    const path = join(directory, 'db');
    writeFileSync(path, 'postgres://desk_web:fixture-password@postgres/personal_desk\n');
    const env = { DESK_CONTAINER_ROLE: 'web', DATA_SOURCE: 'database', DATABASE_URL_FILE: path };
    const args = [
      '--import',
      new URL('./preload.mjs', import.meta.url).href,
      '-e',
      "if(!process.env.DATABASE_URL)process.exit(2); console.log('started')",
    ];
    const valid = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout.trim(), 'started');
    const conflict = spawnSync(process.execPath, args, {
      env: { ...env, DATABASE_URL: 'confidential' },
      encoding: 'utf8',
    });
    assert.equal(conflict.status, 1);
    assert.ok(!conflict.stderr.includes('confidential'));
    assert.ok(!conflict.stderr.includes('fixture-password'));
    assert.ok(!conflict.stdout.includes('started'));
    const mock = spawnSync(process.execPath, args, {
      env: { ...env, DATA_SOURCE: 'mock' },
      encoding: 'utf8',
    });
    assert.equal(mock.status, 1);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('provision creates distinct role secrets and never overwrites an existing set', () => {
  const directory = mkdtempSync(join(tmpdir(), 'desk-provision-'));
  try {
    provision(directory);
    const admin = readFileSync(join(directory, 'admin_database_url'), 'utf8').trim();
    const password = readFileSync(join(directory, 'postgres_password'), 'utf8').trim();
    assert.equal(new URL(admin).password, password);
    const web = new URL(readFileSync(join(directory, 'web_database_url'), 'utf8').trim());
    const worker = new URL(readFileSync(join(directory, 'worker_database_url'), 'utf8').trim());
    assert.equal(new Set([password, web.password, worker.password]).size, 3);
    assert.throws(() => provision(directory), /already_exist/);
    assert.equal(readFileSync(join(directory, 'admin_database_url'), 'utf8').trim(), admin);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
