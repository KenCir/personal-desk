import { renameSync, writeFileSync, rmSync } from 'node:fs';

/** Liveness only; sync_runs / integration health report business success separately. */
export function heartbeat(path: string | undefined, now = () => Date.now()) {
  let state = 'waiting';
  let lastProgressAt = now();
  const write = () => {
    if (!path) return;
    writeFileSync(
      `${path}.tmp`,
      JSON.stringify({ pid: process.pid, state, updatedAt: now(), lastProgressAt }),
      { mode: 0o600 },
    );
    renameSync(`${path}.tmp`, path);
  };
  write();
  const timer = path ? setInterval(write, 10000) : undefined;
  timer?.unref();
  return {
    progress(next: 'waiting' | 'running' | 'stopping') {
      state = next;
      lastProgressAt = now();
      write();
    },
    stop() {
      clearInterval(timer);
      if (path) rmSync(path, { force: true });
    },
  };
}
