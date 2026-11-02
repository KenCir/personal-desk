import { createHash } from 'node:crypto';
import { withNotionSession } from '@personal-desk/database';
import { assertTarget, databaseTarget, NOTION_VERSION } from './config';
import { NotionCollector } from './collector';
import { collectNotion, synchronize } from './sync';
import { preflight } from './writer';
import { NotionSyncError, safeIssue, type Mapping, type SourceIds, type SyncMode } from './types';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
export function mappingFingerprint(mapping: Mapping) {
  return createHash('sha256')
    .update(JSON.stringify(canonical({ mapping, version: NOTION_VERSION })))
    .digest('hex');
}
/** The only live synchronization entry point, shared by CLI and Worker. */
export async function runNotionSync(options: {
  url: string;
  target?: string;
  token: string;
  ids: SourceIds;
  mapping: Mapping;
  dryRun: boolean;
  mode?: SyncMode;
  trigger?: 'manual' | 'worker';
  signal?: AbortSignal;
  fullIntervalMs?: number;
  overlapMs?: number;
}) {
  const target = databaseTarget(options.url);
  if (!options.dryRun) assertTarget(options.url, options.target);
  try {
    return await withNotionSession(options.url, async ({ db, assertHeld }) => {
      const check = await preflight(db, target.database);
      if (!check.ready) throw new NotionSyncError('migration_required_before_sync');
      const guard: typeof assertHeld = async (tx) => {
        if (options.signal?.aborted) throw new NotionSyncError('notion_sync_aborted');
        await assertHeld(tx);
      };
      const client = new NotionCollector(options.token, { signal: options.signal });
      return synchronize({
        db,
        ids: options.ids,
        dryRun: options.dryRun,
        assertHeld: guard,
        fingerprint: mappingFingerprint(options.mapping),
        mode: options.mode,
        trigger: options.trigger,
        fullIntervalMs: options.fullIntervalMs,
        overlapMs: options.overlapMs,
        collect: (request) => collectNotion(client, options.ids, options.mapping, request),
      });
    });
  } catch (error) {
    const code = safeIssue(error);
    if (code === 'notion_sync_busy')
      return { status: 'skipped' as const, reason: 'busy', issues: [], dryRun: options.dryRun };
    return { status: 'failed' as const, issues: [{ code }], dryRun: options.dryRun };
  }
}
