import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthy } from './worker-health.mjs';
test('allows live waiting including Retry-After, rejects stale/future/stopping state', () => {
  for (const state of ['waiting', 'running'])
    assert.equal(healthy({ pid: 1, state, updatedAt: 100000 }, 110000), true);
  for (const value of [
    { pid: 1, state: 'waiting', updatedAt: 1 },
    { pid: 1, state: 'running', updatedAt: 120000 },
    { pid: 1, state: 'stopping', updatedAt: 100000 },
    { pid: -1, state: 'waiting', updatedAt: 100000 },
  ])
    assert.equal(healthy(value, 110000), false);
});
