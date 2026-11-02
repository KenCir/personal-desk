import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import * as s from '@personal-desk/database/schema';
import { NotionSyncError, sourceKinds, type SourceIds, type SourceKind } from './types';
import type { WriteTransaction } from './writer';

export const cursorScope = 'notion.sync.v1';
export interface SyncState {
  version: 1;
  fingerprint: string;
  baselineAt: string | null;
  lastFullAt: string | null;
  revision: number;
  known: Record<SourceKind, string[]>;
  retryNotBefore: string | null;
}
export const emptyState = (fingerprint: string): SyncState => ({
  version: 1,
  fingerprint,
  baselineAt: null,
  lastFullAt: null,
  revision: 0,
  known: { areas: [], projects: [], tasks: [] },
  retryNotBefore: null,
});
export function integrationName(ids: SourceIds) {
  // Preserve the identity used by the existing manual importer.
  const ordered = { areas: ids.areas, projects: ids.projects, tasks: ids.tasks };
  return `Notion initial sync (${createHash('sha256').update(JSON.stringify(ordered)).digest('hex').slice(0, 20)})`;
}
export async function findIntegration(db: WriteTransaction, ids: SourceIds) {
  const matches = await db
    .select()
    .from(s.integrations)
    .where(
      and(eq(s.integrations.provider, 'notion'), eq(s.integrations.name, integrationName(ids))),
    );
  if (matches.length > 1) throw new NotionSyncError('ambiguous_integration');
  return matches[0];
}
export async function readState(
  db: WriteTransaction,
  integrationId: string | undefined,
  fingerprint: string,
) {
  const row = integrationId
    ? (
        await db
          .select()
          .from(s.integrationCursors)
          .where(
            and(
              eq(s.integrationCursors.integrationId, integrationId),
              eq(s.integrationCursors.scope, cursorScope),
            ),
          )
      )[0]
    : undefined;
  if (!row) return { state: emptyState(fingerprint), watermark: null };
  const state = row.metadata as SyncState | null;
  const validDate = (value: unknown) =>
    value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (
    !state ||
    state.version !== 1 ||
    typeof state.fingerprint !== 'string' ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    !validDate(state.baselineAt) ||
    !validDate(state.lastFullAt) ||
    !validDate(state.retryNotBefore) ||
    !validDate(row.cursor) ||
    !state.known ||
    sourceKinds.some(
      (kind) =>
        !Array.isArray(state.known[kind]) || state.known[kind].some((id) => typeof id !== 'string'),
    )
  )
    throw new NotionSyncError('invalid_sync_state');
  if (state.fingerprint !== fingerprint)
    return {
      state: {
        ...emptyState(fingerprint),
        known: state.known,
        revision: state.revision,
        retryNotBefore: state.retryNotBefore,
      },
      watermark: null,
    };
  return { state, watermark: row.cursor };
}
export async function saveState(
  db: WriteTransaction,
  integrationId: string,
  state: SyncState,
  watermark: string | null,
  now: string,
) {
  await db
    .insert(s.integrationCursors)
    .values({
      integrationId,
      scope: cursorScope,
      cursor: watermark,
      metadata: state,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [s.integrationCursors.integrationId, s.integrationCursors.scope],
      set: { cursor: watermark, metadata: state, updatedAt: now },
    });
}
