import {
  activeAlerts,
  activityLimit,
  activityPage,
  filterActivities,
  filterProjects,
  nextMilestone,
  todayTasks,
  type DeskData,
  type DeskDataSource,
} from '@personal-desk/core';

export function createMockDataSource(data: DeskData): DeskDataSource {
  return {
    calendarStatus: 'sample',
    getProjects: async (query) => filterProjects(data.projects, query),
    getAreas: async () => data.areas,
    getProjectBySlug: async (slug) => data.projects.find((p) => p.slug === slug) ?? null,
    getNextMilestone: async (projectId) => nextMilestone(data.milestones, projectId) ?? null,
    getResources: async (projectId) =>
      data.resources
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    getActivities: async (query = {}) => {
      const limit = activityLimit(query.limit);
      const rows = filterActivities(data.activities, query).filter(
        (a) =>
          !query.cursor ||
          Date.parse(a.occurredAt) < Date.parse(query.cursor.occurredAt) ||
          (Date.parse(a.occurredAt) === Date.parse(query.cursor.occurredAt) &&
            a.id.localeCompare(query.cursor.id) > 0),
      );
      return activityPage(rows.slice(0, limit + 1), limit);
    },
    getTodayTasks: async (now) => todayTasks(data.tasks, now),
    getInfrastructure: async () => ({
      systems: data.systems,
      services: data.services,
      backups: data.backups,
      alerts: activeAlerts(data.alerts),
    }),
    getEvents: async () => data.events,
  };
}
