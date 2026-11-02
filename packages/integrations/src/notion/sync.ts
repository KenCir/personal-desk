import { NotionCollector, inspectSchema, validateSchemas, type SchemaReport } from './collector';
import { normalizeBatch } from './normalize';
import {
  sourceKinds,
  safeIssue,
  type Issue,
  type Mapping,
  type NormalizedBatch,
  type SourceIds,
  type SourceKind,
  type CollectionRequest,
  NotionSyncError,
} from './types';
import {
  applyBatch,
  failRun,
  previewPlan,
  startRun,
  type SyncDatabase,
  type ApplyOptions,
  type Run,
} from './writer';
import { findIntegration, readState } from './state';

export interface Collection {
  schemas: SchemaReport[];
  batch: NormalizedBatch;
  fatal: boolean;
  retryNotBefore?: string;
}
export async function collectNotion(
  client: NotionCollector,
  ids: SourceIds,
  mapping: Mapping,
  request?: CollectionRequest,
): Promise<Collection> {
  const schemas: SchemaReport[] = [];
  const pages: Record<SourceKind, unknown[]> = { areas: [], projects: [], tasks: [] };
  const issues: Issue[] = [];
  try {
    for (const kind of sourceKinds)
      schemas.push(inspectSchema(await client.getDataSource(ids[kind]), kind, ids[kind]));
    const validation = validateSchemas(schemas, mapping, ids);
    issues.push(...validation.issues);
    if (issues.some((issue) => issue.code !== 'unmapped_schema_option'))
      return {
        schemas,
        fatal: true,
        batch: {
          areas: [],
          projects: [],
          tasks: [],
          fetched: { areas: 0, projects: 0, tasks: 0 },
          issues,
        },
      };
    for (const kind of sourceKinds)
      pages[kind] = await client.getPages(
        ids[kind],
        Object.values(validation.resolved[kind]),
        request,
      );
    const batch = normalizeBatch(pages, validation.resolved, mapping, ids);
    batch.issues.unshift(...issues);
    return { schemas, batch, fatal: false };
  } catch (error) {
    return {
      schemas,
      fatal: true,
      retryNotBefore: error instanceof NotionSyncError ? error.retryNotBefore : undefined,
      batch: {
        areas: [],
        projects: [],
        tasks: [],
        fetched: {
          areas: pages.areas.length,
          projects: pages.projects.length,
          tasks: pages.tasks.length,
        },
        issues: [...issues, { code: safeIssue(error) }],
      },
    };
  }
}
export async function synchronize(
  options: ApplyOptions & {
    db: SyncDatabase;
    ids: SourceIds;
    collect: (request: CollectionRequest) => Promise<Collection>;
    dryRun: boolean;
    clock?: () => string;
    trigger?: 'manual' | 'worker';
    fullIntervalMs?: number;
    overlapMs?: number;
  },
) {
  const clock = options.clock ?? (() => new Date().toISOString());
  const startedAt = clock();
  let run: Run | null = null;
  let collection: Collection | undefined;
  try {
    await options.assertHeld?.();
    const integration = await findIntegration(options.db, options.ids);
    if (integration && !integration.enabled)
      return { status: 'skipped' as const, reason: 'disabled', dryRun: options.dryRun, issues: [] };
    const { state, watermark } = await readState(
      options.db,
      integration?.id,
      options.fingerprint ?? '',
    );
    if (state.retryNotBefore && Date.parse(state.retryNotBefore) > Date.parse(startedAt))
      return {
        status: 'skipped' as const,
        reason: 'retry_later',
        retryNotBefore: state.retryNotBefore,
        dryRun: options.dryRun,
        issues: [],
      };
    const fullDue =
      !state.lastFullAt ||
      Date.parse(startedAt) - Date.parse(state.lastFullAt) >=
        (options.fullIntervalMs ?? 6 * 60 * 60 * 1000);
    const mode = !state.baselineAt || !watermark || fullDue ? 'full' : (options.mode ?? 'full');
    const applyOptions = { ...options, mode };
    run = options.dryRun ? null : await startRun(options.db, options.ids, startedAt, applyOptions);
    collection = await options.collect({
      mode,
      ...(mode === 'incremental' && watermark
        ? {
            since: new Date(Date.parse(watermark) - (options.overlapMs ?? 120000)).toISOString(),
          }
        : {}),
    });
    await options.assertHeld?.();
    const fetched = Object.values(collection.batch.fetched).reduce((a, b) => a + b, 0);
    if (collection.fatal) {
      if (run)
        await failRun(
          options.db,
          run,
          JSON.stringify(collection.batch.issues.slice(0, 100)),
          clock(),
          fetched,
          { ...applyOptions, retryNotBefore: collection.retryNotBefore },
        );
      return {
        status: 'failed' as const,
        dryRun: options.dryRun,
        schemas: collection.schemas,
        fetched: collection.batch.fetched,
        issues: collection.batch.issues,
        retryNotBefore: collection.retryNotBefore,
      };
    }
    if (options.dryRun) {
      const plan = await previewPlan(
        options.db,
        collection.batch,
        clock(),
        options.ids,
        applyOptions,
      );
      return {
        status: plan.issues.length ? ('partial' as const) : ('success' as const),
        dryRun: true,
        schemas: collection.schemas,
        fetched: collection.batch.fetched,
        counts: plan.counts,
        issues: plan.issues,
        warnings: plan.warnings,
        activitiesCreated: plan.activities.length,
        deleted: plan.deletions.length,
        baselineEstablished: plan.baselineEstablished,
        mode,
      };
    }
    const { plan, status, activitiesCreated, deleted, baselineEstablished } = await applyBatch(
      options.db,
      collection.batch,
      run!,
      clock(),
      applyOptions,
    );
    return {
      status,
      dryRun: false,
      runId: run!.runId,
      schemas: collection.schemas,
      fetched: collection.batch.fetched,
      counts: plan.counts,
      issues: plan.issues,
      warnings: plan.warnings,
      activitiesCreated,
      deleted,
      baselineEstablished,
      mode,
    };
  } catch (error) {
    const code = safeIssue(error);
    if (run) {
      try {
        await failRun(
          options.db,
          run,
          code,
          clock(),
          collection ? Object.values(collection.batch.fetched).reduce((a, b) => a + b, 0) : 0,
          options,
        );
      } catch {
        // A lost session must never reconnect to write a failure record. A later locked
        // run will recover the interrupted record. Preserve the original safe error.
      }
    }
    return { status: 'failed' as const, dryRun: options.dryRun, issues: [{ code }] };
  }
}
