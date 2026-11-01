import type { ActivityFilters } from './selectors';
import type {
  Activity,
  Area,
  CalendarEvent,
  Infrastructure,
  Milestone,
  Project,
  Resource,
  Task,
} from './types';

export interface ActivityCursor {
  occurredAt: string;
  id: string;
}
export interface ActivityQuery extends ActivityFilters {
  cursor?: ActivityCursor | null;
  limit?: number;
}
export interface ActivityPage {
  items: Activity[];
  nextCursor: ActivityCursor | null;
}
export interface ProjectQuery {
  search?: string;
  status?: Project['status'] | '';
  areaId?: string;
}
/** Small read-only contract; implementations return domain models, never database rows. */
export interface DeskReader {
  getProjects(filters?: ProjectQuery): Promise<Project[]>;
  getAreas(): Promise<Area[]>;
  getProjectBySlug(slug: string): Promise<Project | null>;
  getNextMilestone(projectId?: string): Promise<Milestone | null>;
  getResources(projectId: string): Promise<Resource[]>;
  getActivities(query?: ActivityQuery): Promise<ActivityPage>;
  getTodayTasks(now: string): Promise<Task[]>;
  getInfrastructure(): Promise<Infrastructure>;
}
export interface DeskDataSource extends DeskReader {
  calendarStatus: 'sample' | 'disconnected';
  getEvents(now: string): Promise<CalendarEvent[]>;
}
export function activityPage(rows: Activity[], limit: number): ActivityPage {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? { occurredAt: last.occurredAt, id: last.id } : null,
  };
}
export function activityLimit(value = 30) {
  if (!Number.isInteger(value) || value < 1 || value > 100)
    throw new Error('Invalid activity limit');
  return value;
}
