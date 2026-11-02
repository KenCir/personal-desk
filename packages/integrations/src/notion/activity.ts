import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import type * as s from '@personal-desk/database/schema';
import { deadlineKey, sameValue, type Plan, type Snapshot } from './plan';
import type { SyncState } from './state';

/** Only observed domain transitions are events; importing history is not an event. */
export function activityPlan(plan: Plan, snapshot: Snapshot, state: SyncState, scope: string) {
  const result: (typeof s.activities.$inferInsert)[] = [];
  if (!state.baselineAt) return result;
  const add = (
    type: string,
    externalId: string,
    at: string,
    title: string,
    projectId: string | null,
    slug: string | null,
    before: unknown,
    after: unknown,
  ) => {
    const transition = createHash('sha256')
      .update(JSON.stringify([before, after]))
      .digest('hex');
    result.push({
      id: uuidv7(),
      provider: 'notion',
      externalId,
      type,
      category: 'project',
      importance: 'normal',
      // A committed transition sequence distinguishes repeated transitions even if Notion
      // returns the same timestamp. The sequence rolls back together with the activity.
      dedupKey: `notion:${scope}:${externalId}:${type}:${at}:${state.revision + 1}:${transition}`,
      title,
      occurredAt: at,
      projectId,
      internalPath: slug ? `/projects/${slug}` : null,
      externalUrl: `https://www.notion.so/${externalId.replaceAll('-', '')}`,
      metadata: { before, after },
    });
  };
  for (const { values: value } of plan.projects) {
    const old = snapshot.projects.find((row) => row.id === value.id);
    const at = value.sourceUpdatedAt!;
    if (!old) {
      if (
        value.sourceCreatedAt &&
        Date.parse(value.sourceCreatedAt) >= Date.parse(state.baselineAt)
      )
        add(
          'project.created',
          value.externalId!,
          value.sourceCreatedAt,
          `Project作成: ${value.name}`,
          value.id,
          value.slug,
          null,
          { status: value.status },
        );
      continue;
    }
    if (old.status !== value.status) {
      const type =
        value.status === 'done'
          ? 'project.completed'
          : old.status === 'done'
            ? 'project.reopened'
            : 'project.status_changed';
      add(
        type,
        value.externalId!,
        at,
        `Project状態変更: ${value.name}`,
        value.id,
        value.slug,
        old.status,
        value.status,
      );
    }
    const milestone = plan.milestones.find(
      (item) => item.values.externalId === deadlineKey(value.externalId!),
    );
    if (milestone) {
      const previous = snapshot.milestones.find((row) => row.id === milestone.values.id);
      const before = { dueAt: previous?.dueAt ?? null, allDay: previous?.allDay ?? false };
      const after = {
        dueAt: milestone.values.dueAt ?? null,
        allDay: milestone.values.allDay ?? false,
      };
      if (!sameValue('dueAt', before.dueAt, after.dueAt) || before.allDay !== after.allDay)
        add(
          'project.deadline_changed',
          value.externalId!,
          at,
          `Project期限変更: ${value.name}`,
          value.id,
          value.slug,
          before,
          after,
        );
    }
  }
  for (const { values: value } of plan.tasks) {
    const old = snapshot.tasks.find((row) => row.id === value.id);
    if (
      !old ||
      old.status === 'done' ||
      value.status !== 'done' ||
      !['high', 'urgent'].includes(value.priority ?? '')
    )
      continue;
    const project =
      plan.projects.find((row) => row.values.id === value.projectId)?.values ??
      snapshot.projects.find((row) => row.id === value.projectId && !row.deletedAt);
    add(
      'task.completed',
      value.externalId!,
      value.sourceUpdatedAt!,
      `重要Task完了: ${value.title}`,
      value.projectId ?? null,
      project?.slug ?? null,
      old.status,
      value.status,
    );
  }
  return result;
}
