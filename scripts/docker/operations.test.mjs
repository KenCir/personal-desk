import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('restore refuses production before invoking Docker, and never falls back to a development env file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'desk-operations-'));
  try {
    const envFile = join(directory, 'empty.env');
    writeFileSync(envFile, '');
    const script = fileURLToPath(new URL('./operations.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, 'restore', 'unused.dump'], {
      env: { DESK_PROJECT: 'personal-desk-prod', DESK_ENV_FILE: envFile, PATH: '' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), 'isolated_restore_project_required');
    const missing = spawnSync(process.execPath, [script, 'migrate'], {
      env: { DESK_PROJECT: 'personal-desk-prod', PATH: '' },
      encoding: 'utf8',
    });
    assert.equal(missing.status, 1);
    assert.ok(missing.stderr.includes('Set DESK_ENV_FILE'));
  } finally {
    rmSync(directory, { recursive: true });
  }
});
