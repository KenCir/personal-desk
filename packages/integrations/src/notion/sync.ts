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
} from './types';
import { applyBatch, failRun, previewPlan, startRun, type SyncDatabase } from './writer';

export interface Collection {
  schemas: SchemaReport[];
  batch: NormalizedBatch;
  fatal: boolean;
}
export async function collectNotion(
  client: NotionCollector,
  ids: SourceIds,
  mapping: Mapping,
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
      pages[kind] = await client.getPages(ids[kind], Object.values(validation.resolved[kind]));
    const batch = normalizeBatch(pages, validation.resolved, mapping, ids);
    batch.issues.unshift(...issues);
    return { schemas, batch, fatal: false };
  } catch (error) {
    return {
      schemas,
      fatal: true,
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
export async function synchronize(options: {
  db: SyncDatabase;
  ids: SourceIds;
  collect: () => Promise<Collection>;
  dryRun: boolean;
  clock?: () => string;
}) {
  const clock = options.clock ?? (() => new Date().toISOString());
  const run = options.dryRun ? null : await startRun(options.db, options.ids, clock());
  let collection: Collection | undefined;
  try {
    collection = await options.collect();
    const fetched = Object.values(collection.batch.fetched).reduce((a, b) => a + b, 0);
    if (collection.fatal) {
      if (run)
        await failRun(
          options.db,
          run,
          JSON.stringify(collection.batch.issues.slice(0, 100)),
          clock(),
          fetched,
        );
      return {
        status: 'failed' as const,
        dryRun: options.dryRun,
        schemas: collection.schemas,
        fetched: collection.batch.fetched,
        issues: collection.batch.issues,
      };
    }
    if (options.dryRun) {
      const plan = await previewPlan(options.db, collection.batch, clock());
      return {
        status: plan.issues.length ? ('partial' as const) : ('success' as const),
        dryRun: true,
        schemas: collection.schemas,
        fetched: collection.batch.fetched,
        counts: plan.counts,
        issues: plan.issues,
        warnings: plan.warnings,
      };
    }
    const { plan, status } = await applyBatch(options.db, collection.batch, run!, clock());
    return {
      status,
      dryRun: false,
      runId: run!.runId,
      schemas: collection.schemas,
      fetched: collection.batch.fetched,
      counts: plan.counts,
      issues: plan.issues,
      warnings: plan.warnings,
    };
  } catch (error) {
    const code = safeIssue(error);
    if (run)
      await failRun(
        options.db,
        run,
        code,
        clock(),
        collection ? Object.values(collection.batch.fetched).reduce((a, b) => a + b, 0) : 0,
      );
    return { status: 'failed' as const, dryRun: options.dryRun, issues: [{ code }] };
  }
}
