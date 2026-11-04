import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProductionSecrets, readSecret, validateDatabaseUrl } from './secrets.mjs';

test('rejects external targets and libpq connection overrides', () => {
  for (const value of [
    'postgres://desk_web:secret@raspberrypi:5432/personal_desk',
    'postgres://desk_web:secret@postgres/other',
    'postgres://desk_web:secret@postgres/personal_desk?host=raspberrypi',
    'postgres://desk_web:secret@postgres:5433/personal_desk',
  ])
    assert.throws(() => validateDatabaseUrl(value), /target_invalid/);
  assert.equal(
    validateDatabaseUrl('postgres://desk_web:a%40b@postgres/personal_desk').hostname,
    'postgres',
  );
});
test('secret errors never reveal sensitive input; conflicting env fails closed', () => {
  assert.throws(
    () => readSecret({ TOKEN: 'secret', TOKEN_FILE: '/secret' }, 'TOKEN'),
    /configuration_invalid/,
  );
  assert.throws(
    () =>
      readSecret({ TOKEN_FILE: '/secret' }, 'TOKEN', () => {
        throw new Error('sensitive');
      }),
    /^Error: secret_unreadable$/,
  );
  for (const value of ['', 'a\nb', 'a\0'])
    assert.throws(() => readSecret({ TOKEN_FILE: '/secret' }, 'TOKEN', () => value));
  assert.equal(
    readSecret({ TOKEN_FILE: '/secret' }, 'TOKEN', () => 'value\r\n'),
    'value',
  );
});
test('web only receives its read role and requires database mode', () => {
  const env = { DESK_CONTAINER_ROLE: 'web', DATA_SOURCE: 'database', DATABASE_URL_FILE: '/db' };
  loadProductionSecrets(env, () => 'postgres://desk_web:secret@postgres/personal_desk');
  assert.equal(env.NOTION_TOKEN, undefined);
  assert.throws(
    () =>
      loadProductionSecrets(
        { ...env, DATABASE_URL: undefined },
        () => 'postgres://personal_desk:secret@postgres/personal_desk',
      ),
    /role_invalid/,
  );
});
test('worker requires exact target and token', () => {
  const env = {
    DESK_CONTAINER_ROLE: 'worker',
    DATABASE_URL_FILE: '/db',
    NOTION_TOKEN_FILE: '/token',
    NOTION_SYNC_TARGET: 'postgres:5432/personal_desk',
  };
  loadProductionSecrets(env, (path) =>
    path === '/db' ? 'postgres://desk_worker:secret@postgres/personal_desk' : 'token',
  );
  assert.equal(env.NOTION_TOKEN, 'token');
});
