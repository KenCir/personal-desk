import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  notInArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import {
  activityLimit,
  activityPage,
  importances,
  orderProjects,
  todayTasks,
  type ActivityQuery,
  type DeskReader,
  type ProjectQuery,
} from '@personal-desk/core';
import * as s from './schema';

// Both postgres-js and PGlite implement the same Drizzle query builder.
type ReadDatabase = Pick<PgDatabase<PgQueryResultHKT, typeof s>, 'select'>;
const liveProject = and(eq(s.projects.id, s.resources.projectId), isNull(s.projects.deletedAt));
const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const literalSearch = (value: string) => `%${value.trim().replace(/[\\%_]/g, '\\$&')}%`;

export function createReadQueries(db: ReadDatabase): DeskReader {
  const projectFields = {
    id: s.projects.id,
    slug: s.projects.slug,
    name: s.projects.name,
    description: sql<string>`coalesce(${s.projects.description}, '')`,
    status: s.projects.status,
    areaId: s.areas.id,
    areaName: s.areas.name,
    updatedAt: s.projects.meaningfulUpdatedAt,
    completedAt: s.projects.completedAt,
  };
  const projects = () =>
    db
      .select(projectFields)
      .from(s.projects)
      .leftJoin(s.areas, and(eq(s.projects.areaId, s.areas.id), isNull(s.areas.deletedAt)));

  async function getProjects(filters: ProjectQuery = {}) {
    if (filters.areaId && !uuid(filters.areaId)) return [];
    const search = filters.search?.trim();
    const rows = await projects().where(
      and(
        isNull(s.projects.deletedAt),
        filters.status ? eq(s.projects.status, filters.status) : undefined,
        filters.areaId ? eq(s.areas.id, filters.areaId) : undefined,
        search
          ? or(
              ilike(s.projects.name, literalSearch(search)),
              ilike(s.projects.description, literalSearch(search)),
              ilike(s.areas.name, literalSearch(search)),
            )
          : undefined,
      ),
    );
    return orderProjects(rows);
  }
  async function getProjectBySlug(slug: string) {
    const rows = await projects()
      .where(and(eq(s.projects.slug, slug), isNull(s.projects.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }
  async function getNextMilestone(projectId?: string) {
    if (projectId && !uuid(projectId)) return null;
    const rows = await db
      .select({
        id: s.milestones.id,
        projectId: s.milestones.projectId,
        title: s.milestones.title,
        dueAt: s.milestones.dueAt,
        allDay: s.milestones.allDay,
        status: s.milestones.status,
      })
      .from(s.milestones)
      .innerJoin(
        s.projects,
        and(eq(s.projects.id, s.milestones.projectId), isNull(s.projects.deletedAt)),
      )
      .where(
        and(
          isNull(s.milestones.deletedAt),
          eq(s.milestones.status, 'pending'),
          isNotNull(s.milestones.dueAt),
          projectId ? eq(s.milestones.projectId, projectId) : undefined,
        ),
      )
      .orderBy(asc(s.milestones.dueAt), asc(s.milestones.id))
      .limit(1);
    return rows[0] ?? null;
  }
  async function getResources(projectId: string) {
    if (!uuid(projectId)) return [];
    return db
      .select({
        id: s.resources.id,
        projectId: s.resources.projectId,
        name: s.resources.name,
        description: s.resources.description,
        type: s.resources.type,
        category: s.resources.category,
        provider: s.resources.provider,
        url: s.resources.url,
        isPrimary: s.resources.isPrimary,
        sortOrder: s.resources.sortOrder,
      })
      .from(s.resources)
      .innerJoin(s.projects, liveProject)
      .where(and(eq(s.resources.projectId, projectId), isNull(s.resources.deletedAt)))
      .orderBy(asc(s.resources.sortOrder), asc(s.resources.id));
  }
  async function getActivities(query: ActivityQuery = {}) {
    const limit = activityLimit(query.limit);
    if (query.projectId && !uuid(query.projectId)) return { items: [], nextCursor: null };
    if (
      query.cursor &&
      (!uuid(query.cursor.id) || !Number.isFinite(Date.parse(query.cursor.occurredAt)))
    )
      throw new Error('Invalid activity cursor');
    const search = query.search?.trim();
    // Left joins retain history after source soft deletion, but suppress dead internal links.
    const rows = await db
      .select({
        id: s.activities.id,
        projectId: s.activities.projectId,
        projectName: s.projects.name,
        projectSlug: s.projects.slug,
        systemName: sql<string | null>`coalesce(${s.services.name}, ${s.systems.name})`,
        category: s.activities.category,
        importance: s.activities.importance,
        provider: s.activities.provider,
        title: s.activities.title,
        description: s.activities.description,
        occurredAt: s.activities.occurredAt,
        internalPath: sql<
          string | null
        >`case when ${s.activities.projectId} is not null and ${s.projects.id} is null then null else ${s.activities.internalPath} end`,
        externalUrl: s.activities.externalUrl,
      })
      .from(s.activities)
      .leftJoin(
        s.projects,
        and(eq(s.projects.id, s.activities.projectId), isNull(s.projects.deletedAt)),
      )
      .leftJoin(
        s.systems,
        and(eq(s.systems.id, s.activities.systemId), isNull(s.systems.deletedAt)),
      )
      .leftJoin(
        s.services,
        and(eq(s.services.id, s.activities.serviceId), isNull(s.services.deletedAt)),
      )
      .where(
        and(
          query.projectId ? eq(s.projects.id, query.projectId) : undefined,
          query.category ? eq(s.activities.category, query.category) : undefined,
          query.importance ? eq(s.activities.importance, query.importance) : undefined,
          query.minimumImportance
            ? inArray(
                s.activities.importance,
                importances.slice(importances.indexOf(query.minimumImportance)),
              )
            : undefined,
          query.since ? gte(s.activities.occurredAt, query.since) : undefined,
          query.until ? lte(s.activities.occurredAt, query.until) : undefined,
          search
            ? or(
                ilike(s.activities.title, literalSearch(search)),
                ilike(s.activities.description, literalSearch(search)),
                ilike(s.projects.name, literalSearch(search)),
              )
            : undefined,
          query.cursor
            ? or(
                lt(s.activities.occurredAt, query.cursor.occurredAt),
                and(
                  eq(s.activities.occurredAt, query.cursor.occurredAt),
                  gt(s.activities.id, query.cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(s.activities.occurredAt), asc(s.activities.id))
      .limit(limit + 1);
    return activityPage(rows, limit);
  }
  async function getTodayTasks(now: string) {
    const rows = await db
      .select({
        id: s.tasks.id,
        projectId: s.tasks.projectId,
        title: s.tasks.title,
        dueAt: s.tasks.dueAt,
        allDay: s.tasks.allDay,
        status: s.tasks.status,
        priority: s.tasks.priority,
      })
      .from(s.tasks)
      .leftJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
      .where(
        and(
          isNull(s.tasks.deletedAt),
          isNull(s.projects.deletedAt),
          notInArray(s.tasks.status, ['done', 'cancelled']),
          isNotNull(s.tasks.dueAt),
          sql`(${s.tasks.dueAt} at time zone 'Asia/Tokyo')::date <= (${now}::timestamptz at time zone 'Asia/Tokyo')::date`,
        ),
      );
    return todayTasks(rows, now);
  }
  async function getInfrastructure() {
    const [systems, services, backups, alerts] = await Promise.all([
      db
        .select({
          id: s.systems.id,
          name: s.systems.name,
          status: s.systems.status,
          lastSuccessAt: s.systems.lastSuccessAt,
          lastCheckedAt: s.systems.lastCheckedAt,
          sortOrder: s.systems.sortOrder,
          cpuUsage: s.systems.cpuUsage,
          memoryUsage: s.systems.memoryUsage,
          diskUsage: s.systems.diskUsage,
          monitoringUrl: s.systems.monitoringUrl,
        })
        .from(s.systems)
        .where(isNull(s.systems.deletedAt)),
      db
        .select({
          id: s.services.id,
          name: s.services.name,
          status: s.services.status,
          lastSuccessAt: s.services.lastSuccessAt,
          lastCheckedAt: s.services.lastCheckedAt,
          sortOrder: s.services.sortOrder,
          systemId: s.services.systemId,
          resourceUrl: s.services.resourceUrl,
        })
        .from(s.services)
        .where(isNull(s.services.deletedAt)),
      db
        .select({
          id: s.backups.id,
          name: s.backups.name,
          status: s.backups.status,
          systemId: s.backups.systemId,
          serviceId: s.backups.serviceId,
          lastSuccessAt: s.backups.lastSuccessAt,
          lastAttemptAt: s.backups.lastAttemptAt,
          lastFailureAt: s.backups.lastFailureAt,
          lastError: s.backups.lastError,
          staleAfterSeconds: s.backups.staleAfterSeconds,
          expectedIntervalSeconds: s.backups.expectedIntervalSeconds,
          sortOrder: s.backups.sortOrder,
        })
        .from(s.backups)
        .where(isNull(s.backups.deletedAt)),
      db
        .select({
          id: s.alerts.id,
          title: s.alerts.title,
          description: s.alerts.description,
          severity: s.alerts.severity,
          status: s.alerts.status,
          systemId: s.alerts.systemId,
          serviceId: s.alerts.serviceId,
          backupId: s.alerts.backupId,
          startedAt: s.alerts.startedAt,
          externalUrl: s.alerts.externalUrl,
        })
        .from(s.alerts)
        .where(eq(s.alerts.status, 'active'))
        .orderBy(desc(s.alerts.severity), desc(s.alerts.startedAt), asc(s.alerts.id)),
    ]);
    // Keep independently live services/backups and historical alerts if their parent was deleted.
    const systemIds = new Set(systems.map((v) => v.id));
    const serviceIds = new Set(services.map((v) => v.id));
    const backupIds = new Set(backups.map((v) => v.id));
    return {
      systems,
      services: services.map((v) => ({
        ...v,
        systemId: v.systemId && systemIds.has(v.systemId) ? v.systemId : null,
      })),
      backups: backups.map((v) => ({
        ...v,
        systemId: v.systemId && systemIds.has(v.systemId) ? v.systemId : null,
        serviceId: v.serviceId && serviceIds.has(v.serviceId) ? v.serviceId : null,
      })),
      alerts: alerts.map((v) => ({
        ...v,
        backupId: v.backupId && backupIds.has(v.backupId) ? v.backupId : null,
        description: v.description ?? '',
        systemId: v.systemId && systemIds.has(v.systemId) ? v.systemId : null,
        serviceId: v.serviceId && serviceIds.has(v.serviceId) ? v.serviceId : null,
      })),
    };
  }
  return {
    getProjects,
    getProjectBySlug,
    getNextMilestone,
    getResources,
    getActivities,
    getTodayTasks,
    getInfrastructure,
    getAreas: () =>
      db
        .select({ id: s.areas.id, name: s.areas.name })
        .from(s.areas)
        .where(isNull(s.areas.deletedAt))
        .orderBy(asc(s.areas.name), asc(s.areas.id)),
  };
}
