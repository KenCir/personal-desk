import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  loadMapping,
  sourceIds,
  runNotionSync,
  redact,
  safeIssue,
} from '@personal-desk/integrations/notion';
import { workerConfig } from './config';
import { schedule } from './scheduler';

const root = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(root, '.env'), quiet: true });
const print = (value: unknown) =>
  console.log(
    redact(JSON.stringify(value), [process.env.NOTION_TOKEN ?? '', process.env.DATABASE_URL ?? '']),
  );
async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.includes('--help')) {
    print({
      commands: ['pnpm notion:worker --dry-run', 'pnpm notion:worker --once', 'pnpm notion:worker'],
      enable:
        'NOTION_WORKER_ENABLED=true and exact NOTION_SYNC_TARGET required for writes; no migrations or service installation.',
    });
    return;
  }
  const config = workerConfig(process.env, args);
  const mapping = await loadMapping(
    process.env.NOTION_MAPPING_FILE ? resolve(root, process.env.NOTION_MAPPING_FILE) : undefined,
  );
  const ids = sourceIds(process.env);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await schedule({
      ...config,
      signal: controller.signal,
      run: () =>
        runNotionSync({
          url: process.env.DATABASE_URL ?? '',
          target: process.env.NOTION_SYNC_TARGET,
          token: process.env.NOTION_TOKEN ?? '',
          ids,
          mapping,
          dryRun: config.dryRun,
          mode: 'incremental',
          trigger: 'worker',
          fullIntervalMs: config.fullIntervalMs,
          signal: controller.signal,
        }),
      report: (result) => {
        print(result);
        if (config.once && ['failed', 'partial'].includes(result.status)) process.exitCode = 1;
      },
    });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
main().catch((error) => {
  const known = ['notion_worker_disabled', 'invalid_worker_arguments', 'invalid_worker_interval'];
  print({
    status: 'failed',
    error:
      error instanceof Error && known.includes(error.message) ? error.message : safeIssue(error),
  });
  process.exitCode = 1;
});
