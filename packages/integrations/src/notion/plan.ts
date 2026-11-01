import { Temporal } from '@js-temporal/polyfill';
import { v7 as uuidv7 } from 'uuid';
import * as s from '@personal-desk/database/schema';
import type { Issue, NormalizedBatch } from './types';

export interface Snapshot {
  areas: (typeof s.areas.$inferSelect)[];
  projects: (typeof s.projects.$inferSelect)[];
  tasks: (typeof s.tasks.$inferSelect)[];
  milestones: (typeof s.milestones.$inferSelect)[];
  resources: (typeof s.resources.$inferSelect)[];
}
type Operation<T> = { action: 'create' | 'update' | 'refresh'; values: T };
export interface Plan {
  areas: Operation<typeof s.areas.$inferInsert>[];
  projects: Operation<typeof s.projects.$inferInsert>[];
  tasks: Operation<typeof s.tasks.$inferInsert>[];
  milestones: Operation<typeof s.milestones.$inferInsert>[];
  resources: Operation<typeof s.resources.$inferInsert>[];
  issues: Issue[];
  warnings: Issue[];
  counts: Record<
    'areas' | 'projects' | 'tasks' | 'milestones' | 'resources',
    { created: number; updated: number; unchanged: number }
  >;
}
const entityKinds = ['areas', 'projects', 'tasks', 'milestones', 'resources'] as const;
export const deadlineKey = (externalId: string) => `notion:project:${externalId}:deadline`;
export const githubKey = (externalId: string) => `notion:project:${externalId}:github`;
export function sameValue(key: string, a: unknown, b: unknown): boolean {
  if (key.endsWith('At') && typeof a === 'string' && typeof b === 'string') {
    try {
      return Temporal.Instant.compare(a, b) === 0;
    } catch {
      return false;
    }
  }
  return a === b;
}
function differs(existing: object, values: object, omit: string[] = []) {
  return Object.entries(values).some(
    ([key, value]) =>
      !omit.includes(key) && !sameValue(key, (existing as Record<string, unknown>)[key], value),
  );
}
function operation<T extends { id: string; updatedAt?: string }>(
  old: object | undefined,
  values: T,
  now: string,
): Operation<T> {
  if (!old) return { action: 'create', values: { ...values, updatedAt: now } };
  const changed = differs(old, values, ['syncedAt', 'sourceUpdatedAt', 'updatedAt']);
  return {
    action: changed ? 'update' : 'refresh',
    values: {
      ...values,
      updatedAt: differs(old, values, ['syncedAt', 'updatedAt']) ? now : (old as T).updatedAt,
    },
  };
}
function older(sourceUpdatedAt: string, old?: { sourceUpdatedAt: string | null }) {
  return old?.sourceUpdatedAt
    ? Temporal.Instant.compare(sourceUpdatedAt, old.sourceUpdatedAt) < 0
    : false;
}
function slug(name: string, fallback: string, externalId: string, used: Set<string>): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)
      .replace(/-$/, '') || fallback;
  let candidate = base;
  if (used.has(candidate) || base === fallback)
    candidate = `${base}-${externalId.replaceAll('-', '')}`;
  let n = 2;
  const stable = candidate;
  while (used.has(candidate)) candidate = `${stable}-${n++}`;
  used.add(candidate);
  return candidate;
}
/** Pure difference calculation, shared by dry-run and the writer under its transaction lock. */
export function planSync(
  batch: NormalizedBatch,
  snapshot: Snapshot,
  now: string,
  newId: () => string = uuidv7,
): Plan {
  const plan: Plan = {
    areas: [],
    projects: [],
    tasks: [],
    milestones: [],
    resources: [],
    issues: [...batch.issues],
    warnings: [],
    counts: Object.fromEntries(
      entityKinds.map((kind) => [kind, { created: 0, updated: 0, unchanged: 0 }]),
    ) as Plan['counts'],
  };
  const areas = new Map(
    snapshot.areas.filter((r) => r.provider === 'notion').map((r) => [r.externalId, r]),
  );
  const projects = new Map(
    snapshot.projects.filter((r) => r.provider === 'notion').map((r) => [r.externalId, r]),
  );
  const tasks = new Map(
    snapshot.tasks.filter((r) => r.provider === 'notion').map((r) => [r.externalId, r]),
  );
  const milestones = new Map(
    snapshot.milestones.filter((r) => r.provider === 'notion').map((r) => [r.externalId, r]),
  );
  const resources = new Map(
    snapshot.resources.filter((r) => r.provider === 'github').map((r) => [r.externalId, r]),
  );
  const areaIds = new Map(
    [...areas].filter(([, r]) => !r.deletedAt).map(([key, r]) => [key, r.id]),
  );
  const projectIds = new Map(
    [...projects].filter(([, r]) => !r.deletedAt).map(([key, r]) => [key, r.id]),
  );
  const areaSlugs = new Set(snapshot.areas.map((r) => r.slug));
  const projectSlugs = new Set(snapshot.projects.map((r) => r.slug));
  const issue = (code: string, source: Issue['source'], externalId: string) =>
    plan.issues.push({ code, source, externalId });
  for (const value of batch.areas) {
    const old = areas.get(value.externalId);
    if (old?.deletedAt) {
      issue('existing_soft_deleted_entity', 'areas', value.externalId);
      continue;
    }
    if (older(value.sourceUpdatedAt, old)) {
      issue('older_source_snapshot', 'areas', value.externalId);
      continue;
    }
    const id = old?.id ?? newId();
    plan.areas.push(
      operation(
        old,
        {
          ...value,
          id,
          provider: 'notion',
          slug: old?.slug ?? slug(value.name, 'area', value.externalId, areaSlugs),
          syncedAt: now,
        },
        now,
      ),
    );
    areaIds.set(value.externalId, id);
  }
  for (const value of batch.projects) {
    const old = projects.get(value.externalId);
    if (old?.deletedAt) {
      issue('existing_soft_deleted_entity', 'projects', value.externalId);
      continue;
    }
    if (older(value.sourceUpdatedAt, old)) {
      issue('older_source_snapshot', 'projects', value.externalId);
      continue;
    }
    const areaId = value.areaExternalId ? areaIds.get(value.areaExternalId) : null;
    if (areaId === undefined) {
      issue('unresolved_area_relation', 'projects', value.externalId);
      continue;
    }
    const id = old?.id ?? newId();
    const milestone = milestones.get(deadlineKey(value.externalId));
    const resource = resources.get(githubKey(value.externalId));
    if (
      (value.managesDeadline && milestone && (milestone.projectId !== id || milestone.deletedAt)) ||
      (value.managesGithub && resource && (resource.projectId !== id || resource.deletedAt))
    ) {
      issue('managed_child_conflict', 'projects', value.externalId);
      continue;
    }
    const deadlineChanged =
      value.managesDeadline &&
      (!sameValue('dueAt', milestone?.dueAt ?? null, value.deadline?.at ?? null) ||
        (milestone?.allDay ?? false) !== (value.deadline?.allDay ?? false));
    const meaningful =
      !old || old.status !== value.status || old.areaId !== areaId || deadlineChanged;
    plan.projects.push(
      operation(
        old,
        {
          id,
          provider: 'notion',
          externalId: value.externalId,
          name: value.name,
          description: value.managesDescription ? value.description : (old?.description ?? null),
          status: value.status,
          areaId,
          slug: old?.slug ?? slug(value.name, 'project', value.externalId, projectSlugs),
          sourceCreatedAt: value.sourceCreatedAt,
          sourceUpdatedAt: value.sourceUpdatedAt,
          syncedAt: now,
          meaningfulUpdatedAt: meaningful ? value.sourceUpdatedAt : old.meaningfulUpdatedAt,
          completedAt:
            value.status === 'done'
              ? old?.status === 'done'
                ? old.completedAt
                : value.sourceUpdatedAt
              : null,
        },
        now,
      ),
    );
    projectIds.set(value.externalId, id);
    if (value.managesDeadline && (value.deadline || milestone)) {
      plan.milestones.push(
        operation(
          milestone,
          {
            id: milestone?.id ?? newId(),
            projectId: id,
            provider: 'notion',
            externalId: deadlineKey(value.externalId),
            title: 'Project deadline',
            dueAt: value.deadline?.at ?? null,
            allDay: value.deadline?.allDay ?? false,
            status: !value.deadline
              ? 'cancelled'
              : value.status === 'done'
                ? 'completed'
                : 'pending',
            completedAt:
              value.deadline && value.status === 'done'
                ? old?.status === 'done'
                  ? old.completedAt
                  : value.sourceUpdatedAt
                : null,
            sourceUpdatedAt: value.sourceUpdatedAt,
            syncedAt: now,
          },
          now,
        ),
      );
    }
    if (value.managesGithub && value.github) {
      plan.resources.push(
        operation(
          resource,
          {
            id: resource?.id ?? newId(),
            projectId: id,
            provider: 'github',
            externalId: githubKey(value.externalId),
            type: 'repository',
            category: 'development',
            name: value.github.name,
            url: value.github.url,
            isPrimary: true,
            sortOrder: resource?.sortOrder ?? 0,
          },
          now,
        ),
      );
    } else if (value.managesGithub && resource) {
      // No delete policy in this phase; report the old link rather than silently deleting it.
      plan.warnings.push({
        code: 'removed_github_link_retained',
        source: 'projects',
        externalId: value.externalId,
      });
    }
  }
  for (const value of batch.tasks) {
    const old = tasks.get(value.externalId);
    if (old?.deletedAt) {
      issue('existing_soft_deleted_entity', 'tasks', value.externalId);
      continue;
    }
    if (older(value.sourceUpdatedAt, old)) {
      issue('older_source_snapshot', 'tasks', value.externalId);
      continue;
    }
    const projectId = value.projectExternalId ? projectIds.get(value.projectExternalId) : null;
    if (projectId === undefined) {
      issue('unresolved_project_relation', 'tasks', value.externalId);
      continue;
    }
    plan.tasks.push(
      operation(
        old,
        {
          id: old?.id ?? newId(),
          provider: 'notion',
          externalId: value.externalId,
          title: value.title,
          projectId,
          status: value.status,
          dueAt: value.managesDue ? (value.due?.at ?? null) : (old?.dueAt ?? null),
          allDay: value.managesDue ? (value.due?.allDay ?? false) : (old?.allDay ?? false),
          priority: value.managesPriority ? value.priority : (old?.priority ?? null),
          sourceUpdatedAt: value.sourceUpdatedAt,
          syncedAt: now,
          completedAt:
            value.status === 'done'
              ? old?.status === 'done'
                ? old.completedAt
                : value.sourceUpdatedAt
              : null,
        },
        now,
      ),
    );
  }
  for (const kind of entityKinds)
    for (const item of plan[kind]) {
      const counter =
        item.action === 'create' ? 'created' : item.action === 'update' ? 'updated' : 'unchanged';
      plan.counts[kind][counter]++;
    }
  return plan;
}
