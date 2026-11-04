// @vitest-environment node
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { heartbeat } from './heartbeat';

it('stays live while waiting without claiming sync success, and removes stale state on exit', () => {
  vi.useFakeTimers();
  const directory = mkdtempSync(join(tmpdir(), 'desk-heartbeat-'));
  const path = join(directory, 'health.json');
  const health = heartbeat(path);
  try {
    const before = JSON.parse(readFileSync(path, 'utf8'));
    vi.advanceTimersByTime(60000);
    const waiting = JSON.parse(readFileSync(path, 'utf8'));
    expect(waiting.state).toBe('waiting');
    expect(waiting.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(waiting.lastProgressAt).toBe(before.lastProgressAt);
    health.progress('running');
    expect(JSON.parse(readFileSync(path, 'utf8')).state).toBe('running');
    health.progress('stopping');
    expect(JSON.parse(readFileSync(path, 'utf8')).state).toBe('stopping');
  } finally {
    health.stop();
    expect(existsSync(path)).toBe(false);
    rmSync(directory, { recursive: true });
    vi.useRealTimers();
  }
});
