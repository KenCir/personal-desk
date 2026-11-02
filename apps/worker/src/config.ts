export function workerConfig(env: NodeJS.ProcessEnv, args: string[]) {
  if (args.some((arg) => !['--once', '--dry-run'].includes(arg)))
    throw new Error('invalid_worker_arguments');
  const dryRun = args.includes('--dry-run');
  if (!dryRun && env.NOTION_WORKER_ENABLED !== 'true') throw new Error('notion_worker_disabled');
  const interval = (key: string, fallback: number) => {
    const result = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isSafeInteger(result) || result < 1000) throw new Error('invalid_worker_interval');
    return result;
  };
  const intervalMs = interval('NOTION_POLL_INTERVAL_MS', 300000);
  const fullIntervalMs = interval('NOTION_FULL_INTERVAL_MS', 21600000);
  if (fullIntervalMs < intervalMs) throw new Error('invalid_worker_interval');
  return { dryRun, once: dryRun || args.includes('--once'), intervalMs, fullIntervalMs };
}
