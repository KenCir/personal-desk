import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createDatabase } from '@personal-desk/database';
import { assertTarget, databaseTarget, loadMapping, NOTION_VERSION, sourceIds } from './config';
import { NotionCollector, inspectSchema, validateSchemas } from './collector';
import { collectNotion, synchronize } from './sync';
import { preflight } from './writer';
import { array, notionId, object, redact, safeIssue, sourceKinds, NotionSyncError } from './types';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
loadEnv({ path: resolve(root, '.env'), quiet: true });
const secrets = [process.env.NOTION_TOKEN ?? '', process.env.DATABASE_URL ?? ''];
if (process.env.DATABASE_URL) {
  try {
    secrets.push(decodeURIComponent(new URL(process.env.DATABASE_URL).password));
  } catch {
    /* reported below without credentials */
  }
}
const print = (value: unknown) => console.log(redact(JSON.stringify(value, null, 2), secrets));

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.includes('--help')) {
    print({
      commands: [
        'pnpm notion:sync --schema-only',
        'pnpm notion:sync --dry-run',
        'pnpm notion:sync --verify',
        'pnpm notion:sync --check-db',
        'pnpm notion:sync',
        'pnpm notion:sync --inspect-database DATABASE_ID',
      ],
      writeGuard:
        'Set NOTION_SYNC_TARGET to the exact host:port/database shown by --check-db. No migrations run automatically.',
      mapping:
        'NOTION_MAPPING_FILE points to an explicit mapping JSON. Without it the documented mapping is validated against live schemas.',
      notionVersion: NOTION_VERSION,
    });
    return;
  }
  const inspectIndex = args.indexOf('--inspect-database');
  if (inspectIndex >= 0) {
    if (args.length !== 2 || inspectIndex !== 0) throw new NotionSyncError('invalid_cli_arguments');
    const client = new NotionCollector(process.env.NOTION_TOKEN ?? '');
    const database = await client.getDatabase(notionId(args[1]));
    print({
      databaseId: notionId(database.id),
      dataSources: array(database.data_sources).map((value) => {
        const item = object(value);
        return { id: notionId(item.id), name: item.name };
      }),
    });
    return;
  }
  const modes = ['--dry-run', '--schema-only', '--verify', '--check-db'];
  if (args.length > 1 || args.some((arg) => !modes.includes(arg)))
    throw new NotionSyncError('invalid_cli_arguments');
  const mode = args[0] ?? 'apply';
  const client = mode === '--check-db' ? null : new NotionCollector(process.env.NOTION_TOKEN ?? '');
  const ids = mode === '--check-db' ? null : sourceIds(process.env);
  const mapping = await loadMapping(
    process.env.NOTION_MAPPING_FILE ? resolve(root, process.env.NOTION_MAPPING_FILE) : undefined,
  );
  if (mode === '--schema-only') {
    const schemas = [];
    for (const kind of sourceKinds)
      schemas.push(inspectSchema(await client!.getDataSource(ids![kind]), kind, ids![kind]));
    const { issues } = validateSchemas(schemas, mapping, ids!);
    print({
      notionVersion: NOTION_VERSION,
      schemas,
      issues,
      status: issues.length ? 'failed' : 'success',
    });
    if (issues.length) process.exitCode = 1;
    return;
  }
  if (mode === '--verify') {
    const collection = await collectNotion(client!, ids!, mapping);
    const { verifyCollection } = await import('./verify');
    const report = await verifyCollection(collection, ids!);
    print(report);
    if (report.status !== 'success') process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL;
  const target = databaseTarget(url);
  print({ mode, target, notionVersion: NOTION_VERSION });
  if (mode === 'apply') assertTarget(url!, process.env.NOTION_SYNC_TARGET);
  const connection = createDatabase(url!);
  try {
    const check = await preflight(connection.db, target.database);
    print({ preflight: check });
    if (mode === '--check-db') return;
    if (mode === 'apply' && !check.ready)
      throw new NotionSyncError('migration_required_before_sync');
    const report = await synchronize({
      db: connection.db,
      ids: ids!,
      collect: () => collectNotion(client!, ids!, mapping),
      dryRun: mode === '--dry-run',
    });
    print(report);
    if (report.status !== 'success' || !check.ready) process.exitCode = 1;
  } finally {
    await connection.close();
  }
}
main().catch((error) => {
  print({ status: 'failed', error: safeIssue(error) });
  process.exitCode = 1;
});
