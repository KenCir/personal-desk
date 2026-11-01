import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const projectStatus = pgEnum('project_status', [
  'planning',
  'active',
  'waiting',
  'blocked',
  'done',
]);
export const activityImportance = pgEnum('activity_importance', [
  'low',
  'normal',
  'high',
  'critical',
]);
export const activityCategory = pgEnum('activity_category', [
  'source_control',
  'project',
  'infrastructure',
  'deployment',
  'other',
]);
export const infrastructureStatus = pgEnum('infrastructure_status', [
  'healthy',
  'warning',
  'down',
  'unknown',
]);
export const backupStatus = pgEnum('backup_status', ['success', 'failed', 'running', 'unknown']);
export const alertSeverity = pgEnum('alert_severity', ['warning', 'critical']);
export const alertStatus = pgEnum('alert_status', ['active', 'resolved']);
export const syncStatus = pgEnum('sync_status', ['running', 'success', 'partial', 'failed']);
export const milestoneStatus = pgEnum('milestone_status', ['pending', 'completed', 'cancelled']);
export const taskStatus = pgEnum('task_status', [
  'todo',
  'in_progress',
  'waiting',
  'done',
  'cancelled',
]);
export const taskPriority = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);
export const resourceType = pgEnum('resource_type', [
  'repository',
  'documentation',
  'deployment',
  'monitoring',
  'service',
  'other',
]);
export const resourceCategory = pgEnum('resource_category', [
  'development',
  'documentation',
  'deployment',
  'monitoring',
  'other',
]);
export const integrationStatus = pgEnum('integration_status', [
  'healthy',
  'error',
  'disabled',
  'unknown',
]);

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
// UUIDs are supplied by the application, allowing UUID v7 without a PG extension.
const id = () => uuid('id').primaryKey();
const audit = () => ({
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});
const softDelete = () => ({ ...audit(), deletedAt: instant('deleted_at') });
const source = () => ({
  provider: text('provider').notNull(),
  externalId: text('external_id').notNull(),
  sourceUpdatedAt: instant('source_updated_at'),
  syncedAt: instant('synced_at'),
});

export const areas = pgTable(
  'areas',
  {
    id: id(),
    ...source(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    ...softDelete(),
  },
  (t) => [unique().on(t.provider, t.externalId)],
);

export const projects = pgTable(
  'projects',
  {
    id: id(),
    ...source(),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    status: projectStatus('status').notNull().default('planning'),
    sourceCreatedAt: instant('source_created_at'),
    meaningfulUpdatedAt: instant('meaningful_updated_at').notNull(),
    completedAt: instant('completed_at'),
    ...softDelete(),
  },
  (t) => [
    unique().on(t.provider, t.externalId),
    index('projects_status_idx').on(t.status),
    index('projects_area_idx').on(t.areaId),
    index('projects_updated_idx').on(t.meaningfulUpdatedAt.desc()),
    check('projects_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const milestones = pgTable(
  'milestones',
  {
    id: id(),
    ...source(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: milestoneStatus('status').notNull().default('pending'),
    dueAt: instant('due_at'),
    allDay: boolean('all_day').notNull().default(false),
    completedAt: instant('completed_at'),
    ...softDelete(),
  },
  (t) => [
    unique().on(t.provider, t.externalId),
    index('milestones_project_idx').on(t.projectId),
    index('milestones_due_idx').on(t.dueAt),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    ...source(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: taskStatus('status').notNull().default('todo'),
    priority: taskPriority('priority'),
    dueAt: instant('due_at'),
    allDay: boolean('all_day').notNull().default(false),
    completedAt: instant('completed_at'),
    ...softDelete(),
  },
  (t) => [
    unique().on(t.provider, t.externalId),
    index('tasks_project_idx').on(t.projectId),
    index('tasks_status_idx').on(t.status),
    index('tasks_due_idx').on(t.dueAt),
  ],
);

export const resources = pgTable(
  'resources',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: resourceType('type').notNull(),
    category: resourceCategory('category').notNull(),
    provider: text('provider').notNull(),
    externalId: text('external_id'),
    name: text('name').notNull(),
    description: text('description'),
    url: text('url').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...softDelete(),
  },
  (t) => [
    unique().on(t.provider, t.externalId),
    index('resources_project_idx').on(t.projectId),
    index('resources_category_idx').on(t.category),
  ],
);

export const systems = pgTable(
  'systems',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    status: infrastructureStatus('status').notNull().default('unknown'),
    cpuUsage: doublePrecision('cpu_usage'),
    memoryUsage: doublePrecision('memory_usage'),
    diskUsage: doublePrecision('disk_usage'),
    lastCheckedAt: instant('last_checked_at'),
    lastSuccessAt: instant('last_success_at'),
    monitoringUrl: text('monitoring_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...softDelete(),
  },
  (t) => [
    check('systems_cpu_range', sql`${t.cpuUsage} between 0 and 100`),
    check('systems_memory_range', sql`${t.memoryUsage} between 0 and 100`),
    check('systems_disk_range', sql`${t.diskUsage} between 0 and 100`),
  ],
);

export const services = pgTable(
  'services',
  {
    id: id(),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    status: infrastructureStatus('status').notNull().default('unknown'),
    lastCheckedAt: instant('last_checked_at'),
    lastSuccessAt: instant('last_success_at'),
    resourceUrl: text('resource_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...softDelete(),
  },
  (t) => [index('services_system_idx').on(t.systemId)],
);

export const backups = pgTable(
  'backups',
  {
    id: id(),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    status: backupStatus('status').notNull().default('unknown'),
    expectedIntervalSeconds: integer('expected_interval_seconds'),
    staleAfterSeconds: integer('stale_after_seconds').notNull(),
    lastAttemptAt: instant('last_attempt_at'),
    lastSuccessAt: instant('last_success_at'),
    lastFailureAt: instant('last_failure_at'),
    lastError: text('last_error'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...softDelete(),
  },
  (t) => [
    check('backups_stale_positive', sql`${t.staleAfterSeconds} > 0`),
    check('backups_interval_positive', sql`${t.expectedIntervalSeconds} > 0`),
  ],
);

export const alerts = pgTable(
  'alerts',
  {
    id: id(),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    backupId: uuid('backup_id').references(() => backups.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    externalId: text('external_id'),
    dedupKey: text('dedup_key').unique(),
    severity: alertSeverity('severity').notNull(),
    status: alertStatus('status').notNull().default('active'),
    title: text('title').notNull(),
    description: text('description'),
    startedAt: instant('started_at').notNull(),
    resolvedAt: instant('resolved_at'),
    externalUrl: text('external_url'),
    metadata: jsonb('metadata'),
    ...audit(),
  },
  (t) => [
    unique().on(t.provider, t.externalId),
    index('alerts_status_severity_idx').on(t.status, t.severity),
    index('alerts_started_idx').on(t.startedAt.desc()),
  ],
);

export const activities = pgTable(
  'activities',
  {
    id: id(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    systemId: uuid('system_id').references(() => systems.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    externalId: text('external_id'),
    dedupKey: text('dedup_key').unique(),
    type: text('type').notNull(),
    category: activityCategory('category').notNull(),
    importance: activityImportance('importance').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    occurredAt: instant('occurred_at').notNull(),
    internalPath: text('internal_path'),
    externalUrl: text('external_url'),
    metadata: jsonb('metadata'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('activities_occurred_idx').on(t.occurredAt.desc()),
    index('activities_project_time_idx').on(t.projectId, t.occurredAt.desc()),
    index('activities_system_time_idx').on(t.systemId, t.occurredAt.desc()),
    index('activities_service_time_idx').on(t.serviceId, t.occurredAt.desc()),
    index('activities_category_idx').on(t.category),
    index('activities_importance_idx').on(t.importance),
  ],
);

export const integrations = pgTable('integrations', {
  id: id(),
  provider: text('provider').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  status: integrationStatus('status').notNull().default('disabled'),
  lastAttemptAt: instant('last_attempt_at'),
  lastSuccessAt: instant('last_success_at'),
  lastErrorAt: instant('last_error_at'),
  lastError: text('last_error'),
  ...audit(),
});
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: id(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: syncStatus('status').notNull(),
    startedAt: instant('started_at').notNull(),
    finishedAt: instant('finished_at'),
    itemsFetched: integer('items_fetched').notNull().default(0),
    itemsCreated: integer('items_created').notNull().default(0),
    itemsUpdated: integer('items_updated').notNull().default(0),
    itemsDeleted: integer('items_deleted').notNull().default(0),
    error: text('error'),
    metadata: jsonb('metadata'),
  },
  (t) => [index('sync_runs_integration_started_idx').on(t.integrationId, t.startedAt.desc())],
);
export const integrationCursors = pgTable(
  'integration_cursors',
  {
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    cursor: text('cursor'),
    metadata: jsonb('metadata'),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.integrationId, t.scope] })],
);
