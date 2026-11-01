import 'server-only';
import { cache } from 'react';
import { createMockData } from './mock-data';
import { createMockDataSource } from './data-sources/mock';
import { getDatabaseDataSource } from './data-sources/database';
import { dataSourceMode } from './data-sources/config';
import type { DeskData, DeskDataSource } from '@personal-desk/core';

export const getReadContext = cache((at?: string) => {
  const now = at ?? new Date().toISOString();
  const mode = dataSourceMode(process.env.DATA_SOURCE);
  const source: DeskDataSource =
    mode === 'database' ? getDatabaseDataSource() : createMockDataSource(createMockData(now));
  return { now, source, mode };
});

// Dashboard read model: no full history/resource dump and no implicit DB->mock fallback.
export const getDeskData = cache(async (): Promise<DeskData> => {
  const { source, now } = getReadContext();
  const [projects, tasks, milestone, activity, infrastructure, events] = await Promise.all([
    source.getProjects(),
    source.getTodayTasks(now),
    source.getNextMilestone(),
    source.getActivities({
      minimumImportance: 'normal',
      since: new Date(Date.parse(now) - 7 * 86400000).toISOString(),
      until: now,
      limit: 5,
    }),
    source.getInfrastructure(),
    source.getEvents(now),
  ]);
  return {
    ...infrastructure,
    now,
    projects,
    tasks,
    milestones: milestone ? [milestone] : [],
    activities: activity.items,
    events,
    calendarStatus: source.calendarStatus,
    areas: [],
    resources: [],
  };
});
