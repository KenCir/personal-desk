// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { schedule } from './scheduler';
import { workerConfig } from './config';

it('requires explicit worker enablement for writes but allows a single dry run', () => {
  expect(() => workerConfig({}, [])).toThrow('notion_worker_disabled');
  expect(workerConfig({}, ['--dry-run'])).toEqual({
    dryRun: true,
    once: true,
    intervalMs: 300000,
    fullIntervalMs: 21600000,
  });
  expect(workerConfig({ NOTION_WORKER_ENABLED: 'true' }, ['--once']).once).toBe(true);
  expect(() =>
    workerConfig({ NOTION_WORKER_ENABLED: 'true', NOTION_POLL_INTERVAL_MS: '0' }, []),
  ).toThrow();
  expect(() => workerConfig({ NOTION_WORKER_ENABLED: 'true' }, ['--unknown'])).toThrow();
});

it('never overlaps slow runs or catches up missed intervals, and respects Retry-After', async () => {
  let now = 0;
  let active = 0;
  const starts: number[] = [];
  const controller = new AbortController();
  await schedule({
    signal: controller.signal,
    intervalMs: 300000,
    once: false,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    run: async () => {
      expect(active++).toBe(0);
      starts.push(now);
      now += 400000;
      await Promise.resolve();
      active--;
      if (starts.length === 3) controller.abort();
      return { status: 'failed', retryNotBefore: new Date(now + 600000).toISOString() };
    },
  });
  expect(starts).toEqual([0, 1000000, 2000000]);
});

it('once exits without sleeping; stop during a wait does not start another invocation', async () => {
  const controller = new AbortController();
  const run = vi.fn(async () => ({ status: 'success' }));
  const sleep = vi.fn(async () => {
    controller.abort();
    throw new Error('aborted');
  });
  await schedule({ signal: controller.signal, intervalMs: 300000, once: true, run, sleep });
  expect(run).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
  await schedule({ signal: controller.signal, intervalMs: 300000, once: false, run, sleep });
  expect(run).toHaveBeenCalledTimes(2);
});
