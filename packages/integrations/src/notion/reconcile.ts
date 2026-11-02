import { Temporal } from '@js-temporal/polyfill';
import {
  sourceKinds,
  type NormalizedBatch,
  type SyncMode,
  type SourceKind,
  type Issue,
} from './types';
import type { Plan, Snapshot } from './plan';
import type { SyncState } from './state';

export interface Deletion {
  source: SourceKind;
  id: string;
  externalId: string;
  sourceUpdatedAt: string;
}
export function reconciliationPlan(
  batch: NormalizedBatch,
  snapshot: Snapshot,
  plan: Plan,
  state: SyncState,
  mode: SyncMode,
) {
  const deletions: Deletion[] = [];
  const warnings: Issue[] = [];
  for (const tombstone of batch.tombstones ?? []) {
    const old = snapshot[tombstone.source].find(
      (row) => row.provider === 'notion' && row.externalId === tombstone.externalId,
    );
    if (!old || old.deletedAt) continue;
    if (
      old.sourceUpdatedAt &&
      Temporal.Instant.compare(tombstone.sourceUpdatedAt, old.sourceUpdatedAt) < 0
    ) {
      warnings.push({
        code: 'older_deletion_signal',
        source: tombstone.source,
        externalId: tombstone.externalId,
      });
      continue;
    }
    // An invalid or contradictory observation must never turn into a deletion.
    if (
      batch.issues.some(
        (issue) => issue.source === tombstone.source && issue.externalId === tombstone.externalId,
      ) ||
      batch[tombstone.source].some((row) => row.externalId === tombstone.externalId)
    )
      continue;
    deletions.push({ ...tombstone, id: old.id });
  }
  if (mode === 'full' && plan.issues.length === 0) {
    for (const source of sourceKinds) {
      const seen = new Set([
        ...batch[source].map((row) => row.externalId),
        ...(batch.tombstones ?? [])
          .filter((row) => row.source === source)
          .map((row) => row.externalId),
      ]);
      for (const externalId of state.known[source]) {
        const old = snapshot[source].find(
          (row) => row.provider === 'notion' && row.externalId === externalId,
        );
        if (old && !old.deletedAt && !seen.has(externalId))
          warnings.push({ code: 'missing_from_full_sync_retained', source, externalId });
      }
    }
  }
  return { deletions, warnings };
}
