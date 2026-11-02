import { setTimeout as delay } from 'node:timers/promises';

export interface ScheduledResult {
  status: string;
  retryNotBefore?: string;
}
/** Await each invocation: elapsed intervals never accumulate overlapping jobs. */
export async function schedule(options: {
  run: () => Promise<ScheduledResult>;
  intervalMs: number;
  once: boolean;
  signal: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  report?: (result: ScheduledResult) => void;
}) {
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0)
    throw new Error('invalid_poll_interval');
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => delay(ms, undefined, { signal: options.signal }));
  while (!options.signal.aborted) {
    const result = await options.run();
    options.report?.(result);
    if (options.once || options.signal.aborted) return;
    const retryAt = result.retryNotBefore ? Date.parse(result.retryNotBefore) : 0;
    const next = Math.max(now() + options.intervalMs, Number.isFinite(retryAt) ? retryAt : 0);
    // Node timers cap at 2^31-1; chunk long Retry-After without retrying early.
    try {
      while (!options.signal.aborted && now() < next) await sleep(Math.min(next - now(), 60_000));
    } catch (error) {
      if (!options.signal.aborted) throw error;
    }
  }
}
