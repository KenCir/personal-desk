import { compareInstants, dateKey, dayDifference } from './datetime';
import {
  importances,
  projectStatuses,
  type Activity,
  type ActivityCategory,
  type Alert,
  type Backup,
  type CalendarEvent,
  type EffectiveBackupStatus,
  type EffectiveHealth,
  type Importance,
  type Infrastructure,
  type Milestone,
  type MonitoredEntity,
  type Project,
  type ProjectStatus,
  type Task,
} from './types';

export function orderProjects(projects: readonly Project[]) {
  return [...projects].sort(
    (a, b) =>
      projectStatuses.indexOf(a.status) - projectStatuses.indexOf(b.status) ||
      Date.parse(b.status === 'done' ? (b.completedAt ?? b.updatedAt) : b.updatedAt) -
        Date.parse(a.status === 'done' ? (a.completedAt ?? a.updatedAt) : a.updatedAt) ||
      a.id.localeCompare(b.id),
  );
}
export function filterProjects(
  projects: readonly Project[],
  filters: { search?: string; status?: ProjectStatus | ''; areaId?: string } = {},
) {
  const search = filters.search?.trim().toLocaleLowerCase('ja-JP') ?? '';
  return orderProjects(
    projects.filter(
      (p) =>
        (!filters.status || p.status === filters.status) &&
        (!filters.areaId || p.areaId === filters.areaId) &&
        `${p.name} ${p.description} ${p.areaName ?? ''}`
          .toLocaleLowerCase('ja-JP')
          .includes(search),
    ),
  );
}
export const activeProjects = (projects: readonly Project[]) =>
  orderProjects(projects.filter((p) => p.status !== 'done')).slice(0, 5);
export interface ActivityFilters {
  search?: string;
  category?: ActivityCategory | '';
  importance?: Importance | '';
  projectId?: string;
  minimumImportance?: Importance;
  since?: string;
  until?: string;
}
export function filterActivities(activities: readonly Activity[], filters: ActivityFilters = {}) {
  const search = filters.search?.trim().toLocaleLowerCase('ja-JP') ?? '';
  return activities
    .filter(
      (a) =>
        (!filters.category || a.category === filters.category) &&
        (!filters.importance || a.importance === filters.importance) &&
        (!filters.projectId || a.projectId === filters.projectId) &&
        (!filters.minimumImportance ||
          importances.indexOf(a.importance) >= importances.indexOf(filters.minimumImportance)) &&
        (!filters.since || Date.parse(a.occurredAt) >= Date.parse(filters.since)) &&
        (!filters.until || Date.parse(a.occurredAt) <= Date.parse(filters.until)) &&
        `${a.title} ${a.description ?? ''} ${a.projectName ?? ''}`
          .toLocaleLowerCase('ja-JP')
          .includes(search),
    )
    .sort((a, b) => compareInstants(b.occurredAt, a.occurredAt) || a.id.localeCompare(b.id));
}
export const recentActivities = (activities: readonly Activity[], now: string) =>
  filterActivities(activities, {
    minimumImportance: 'normal',
    since: new Date(Date.parse(now) - 7 * 86_400_000).toISOString(),
    until: now,
  }).slice(0, 5);
export function groupActivities(activities: readonly Activity[]) {
  const groups = new Map<string, Activity[]>();
  for (const activity of filterActivities(activities)) {
    const key = dateKey(activity.occurredAt);
    groups.set(key, [...(groups.get(key) ?? []), activity]);
  }
  return [...groups].map(([date, items]) => ({ date, items }));
}
export function activityDestination(activity: Activity) {
  if (activity.projectSlug) return `/projects/${activity.projectSlug}`;
  if (activity.systemName || activity.category === 'infrastructure') return '/infrastructure';
  return activity.internalPath ?? safeExternalUrl(activity.externalUrl);
}
export function safeExternalUrl(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
export function isStale(lastSuccessAt: string | null, now: string, thresholdSeconds = 300) {
  return (
    lastSuccessAt !== null &&
    Number.isFinite(Date.parse(lastSuccessAt)) &&
    Date.parse(now) - Date.parse(lastSuccessAt) >= thresholdSeconds * 1000
  );
}
export function effectiveHealth(
  entity: Pick<MonitoredEntity, 'status' | 'lastSuccessAt'>,
  now: string,
): EffectiveHealth {
  if (!entity.lastSuccessAt || !Number.isFinite(Date.parse(entity.lastSuccessAt))) return 'unknown';
  return isStale(entity.lastSuccessAt, now) ? 'stale' : entity.status;
}
export function effectiveBackup(
  backup: Pick<Backup, 'status' | 'lastSuccessAt' | 'staleAfterSeconds'>,
  now: string,
): EffectiveBackupStatus {
  // An explicit failed/running state remains visible even if the previous success is old.
  if (backup.status === 'failed' || backup.status === 'running') return backup.status;
  if (
    backup.status === 'unknown' ||
    !backup.lastSuccessAt ||
    !Number.isFinite(Date.parse(backup.lastSuccessAt))
  )
    return 'unknown';
  return Date.parse(now) - Date.parse(backup.lastSuccessAt) > backup.staleAfterSeconds * 1000
    ? 'stale'
    : backup.status;
}
export const healthOrder: EffectiveHealth[] = ['down', 'warning', 'stale', 'unknown', 'healthy'];
const backupOrder: EffectiveBackupStatus[] = ['failed', 'stale', 'unknown', 'running', 'success'];
export function orderMonitored<T extends MonitoredEntity>(items: readonly T[], now: string): T[] {
  return [...items].sort(
    (a, b) =>
      healthOrder.indexOf(effectiveHealth(a, now)) - healthOrder.indexOf(effectiveHealth(b, now)) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name),
  );
}
export const orderBackups = (items: readonly Backup[], now: string) =>
  [...items].sort(
    (a, b) =>
      backupOrder.indexOf(effectiveBackup(a, now)) - backupOrder.indexOf(effectiveBackup(b, now)) ||
      a.sortOrder - b.sortOrder,
  );
export const activeAlerts = (items: readonly Alert[]) =>
  items
    .filter((a) => a.status === 'active')
    .sort(
      (a, b) =>
        Number(b.severity === 'critical') - Number(a.severity === 'critical') ||
        Date.parse(b.startedAt) - Date.parse(a.startedAt),
    );
export function overallStatus(data: Infrastructure, now: string): EffectiveHealth {
  const health = [...data.systems, ...data.services].map((e) => effectiveHealth(e, now));
  const alerts = activeAlerts(data.alerts);
  const backups = data.backups.map((b) => effectiveBackup(b, now));
  if (health.includes('down') || alerts.some((a) => a.severity === 'critical')) return 'down';
  if (
    health.some((s) => s !== 'healthy') ||
    alerts.length ||
    backups.some((s) => ['failed', 'stale', 'unknown'].includes(s))
  )
    return 'warning';
  if (!health.length && !backups.length) return 'unknown';
  return 'healthy';
}
export function nextMilestone(items: readonly Milestone[], projectId?: string) {
  return items
    .filter((m) => m.status === 'pending' && m.dueAt && (!projectId || m.projectId === projectId))
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))[0];
}
export const nextEvent = (events: readonly CalendarEvent[], now: string) =>
  events
    .filter(
      (e) =>
        !e.cancelled &&
        !e.allDay &&
        dateKey(e.startsAt) === dateKey(now) &&
        Date.parse(e.startsAt) >= Date.parse(now),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
export function todayTasks(tasks: readonly Task[], now: string) {
  const priority = { urgent: 0, high: 1, medium: 2, low: 3 };
  const bucket = (task: Task) =>
    task.dueAt &&
    (task.allDay ? dayDifference(task.dueAt, now) < 0 : Date.parse(task.dueAt) < Date.parse(now))
      ? 0
      : 1;
  return tasks
    .filter(
      (t) =>
        !['done', 'cancelled'].includes(t.status) && t.dueAt && dayDifference(t.dueAt, now) <= 0,
    )
    .sort(
      (a, b) =>
        bucket(a) - bucket(b) ||
        (a.priority ? priority[a.priority] : 4) - (b.priority ? priority[b.priority] : 4) ||
        Date.parse(a.dueAt!) - Date.parse(b.dueAt!),
    );
}
