export const projectStatuses = ['blocked', 'active', 'planning', 'waiting', 'done'] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const categories = [
  'source_control',
  'project',
  'infrastructure',
  'deployment',
  'other',
] as const;
export type ActivityCategory = (typeof categories)[number];
export const importances = ['low', 'normal', 'high', 'critical'] as const;
export type Importance = (typeof importances)[number];
export const resourceCategories = [
  'development',
  'documentation',
  'deployment',
  'monitoring',
  'other',
] as const;
export type ResourceCategory = (typeof resourceCategories)[number];
export type Health = 'healthy' | 'warning' | 'down' | 'unknown';
export type EffectiveHealth = Health | 'stale';
export type BackupStatus = 'success' | 'failed' | 'running' | 'unknown';
export type EffectiveBackupStatus = BackupStatus | 'stale';
export interface Area {
  id: string;
  name: string;
}
export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: ProjectStatus;
  areaId: string | null;
  areaName: string | null;
  /** Read-model alias of projects.meaningful_updated_at, never synced_at. */
  updatedAt: string;
  completedAt: string | null;
}
export interface Activity {
  id: string;
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  systemName: string | null;
  category: ActivityCategory;
  importance: Importance;
  provider: string;
  title: string;
  description: string | null;
  occurredAt: string;
  internalPath: string | null;
  externalUrl: string | null;
}
export interface Resource {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  type: 'repository' | 'documentation' | 'deployment' | 'monitoring' | 'service' | 'other';
  category: ResourceCategory;
  provider: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}
export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  dueAt: string | null;
  allDay: boolean;
  status: 'pending' | 'completed' | 'cancelled';
}
export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  dueAt: string | null;
  allDay: boolean;
  status: 'todo' | 'in_progress' | 'waiting' | 'done' | 'cancelled';
  priority: 'urgent' | 'high' | 'medium' | 'low' | null;
}
export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  cancelled: boolean;
}
export interface MonitoredEntity {
  id: string;
  name: string;
  status: Health;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  sortOrder: number;
}
export interface System extends MonitoredEntity {
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskUsage: number | null;
  monitoringUrl: string | null;
}
export interface Service extends MonitoredEntity {
  systemId: string | null;
  resourceUrl: string | null;
}
export interface Backup {
  id: string;
  name: string;
  systemId: string | null;
  serviceId: string | null;
  status: BackupStatus;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  staleAfterSeconds: number;
  expectedIntervalSeconds: number | null;
  sortOrder: number;
}
export interface Alert {
  backupId?: string | null;
  id: string;
  title: string;
  description: string;
  severity: 'warning' | 'critical';
  status: 'active' | 'resolved';
  systemId: string | null;
  serviceId: string | null;
  startedAt: string;
  externalUrl: string | null;
}
export interface Infrastructure {
  systems: System[];
  services: Service[];
  backups: Backup[];
  alerts: Alert[];
}
export interface DeskData extends Infrastructure {
  calendarStatus?: 'sample' | 'disconnected';
  now: string;
  areas: Area[];
  projects: Project[];
  activities: Activity[];
  resources: Resource[];
  milestones: Milestone[];
  tasks: Task[];
  events: CalendarEvent[];
}
/** Data and fetch outcome are independent, so partial failures retain cached content. */
export interface SectionState {
  loading?: boolean;
  error?: boolean;
  stale?: boolean;
  lastSuccessAt?: string | null;
}
