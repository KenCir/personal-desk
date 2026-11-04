import { readFileSync } from 'node:fs';
export function healthy(value, now = Date.now()) {
  return (
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    ['waiting', 'running'].includes(value.state) &&
    Number.isFinite(value.updatedAt) &&
    value.updatedAt <= now &&
    now - value.updatedAt < 45000
  );
}
if (process.argv[1]?.endsWith('worker-health.mjs')) {
  try {
    const value = JSON.parse(
      readFileSync(process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker-heartbeat.json', 'utf8'),
    );
    if (!healthy(value)) throw new Error();
    process.kill(value.pid, 0);
  } catch {
    process.exitCode = 1;
  }
}
