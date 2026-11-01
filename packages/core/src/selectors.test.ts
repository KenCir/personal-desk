import { describe, expect, it } from 'vitest';
import {
  activeAlerts,
  activeProjects,
  activityDestination,
  dateGroup,
  dayDifference,
  effectiveBackup,
  effectiveHealth,
  filterActivities,
  filterProjects,
  formatDate,
  groupActivities,
  isStale,
  nextEvent,
  nextMilestone,
  orderBackups,
  orderMonitored,
  orderProjects,
  overallStatus,
  recentActivities,
  safeExternalUrl,
  todayTasks,
  type Activity,
  type Backup,
  type Infrastructure,
  type Project,
} from './index';

const now = '2026-09-19T00:00:00Z';
const ago = (seconds: number) => new Date(Date.parse(now) - seconds * 1000).toISOString();
const project = (
  id: string,
  status: Project['status'],
  updatedAt = now,
  completedAt: string | null = null,
): Project => ({
  id,
  slug: id,
  name: id,
  description: '説明',
  areaName: '個人開発',
  areaId: 'dev',
  status,
  updatedAt,
  completedAt,
});
const activity = (id: string, occurredAt = now, extra: Partial<Activity> = {}): Activity => ({
  id,
  occurredAt,
  title: 'CI failed',
  description: null,
  projectId: 'desk',
  projectName: 'Personal Desk',
  projectSlug: 'desk',
  systemName: null,
  category: 'source_control',
  importance: 'normal',
  provider: 'GitHub',
  internalPath: null,
  externalUrl: 'https://github.com/',
  ...extra,
});
const empty: Infrastructure = { systems: [], services: [], backups: [], alerts: [] };
const backup = (extra: Partial<Backup> = {}): Backup => ({
  id: 'b',
  name: 'Backup',
  status: 'success',
  lastSuccessAt: ago(3600),
  lastAttemptAt: ago(3600),
  lastFailureAt: null,
  lastError: null,
  systemId: null,
  serviceId: null,
  expectedIntervalSeconds: 86400,
  staleAfterSeconds: 108000,
  sortOrder: 0,
  ...extra,
});

describe('projects', () => {
  it('orders statuses, meaningful updates, and completion dates without mutating input', () => {
    const items = [
      project('old-active', 'active', ago(60)),
      project('done-1', 'done', now, ago(200)),
      project('blocked', 'blocked'),
      project('new-active', 'active'),
      project('done-2', 'done', ago(1000), ago(100)),
      project('waiting', 'waiting'),
      project('planning', 'planning'),
    ];
    expect(orderProjects(items).map((p) => p.id)).toEqual([
      'blocked',
      'new-active',
      'old-active',
      'planning',
      'waiting',
      'done-2',
      'done-1',
    ]);
    expect(items[0].id).toBe('old-active');
    expect(activeProjects(items)).toHaveLength(5);
    expect(activeProjects(items).every((p) => p.status !== 'done')).toBe(true);
  });
  it('falls back to updatedAt for done and combines search/status/area', () => {
    const items = [
      project('Desk', 'done'),
      project('older', 'done', ago(10)),
      project('other', 'active'),
    ];
    expect(
      orderProjects(items)
        .filter((p) => p.status === 'done')
        .map((p) => p.id),
    ).toEqual(['Desk', 'older']);
    expect(
      filterProjects(items, { search: '個人開発', status: 'active', areaId: 'dev' }).map(
        (p) => p.id,
      ),
    ).toEqual(['other']);
    expect(filterProjects(items, { search: 'desk' })).toHaveLength(1);
    expect(filterProjects(items, { search: '説明', areaId: 'missing' })).toHaveLength(0);
  });
});
describe('activity', () => {
  it('preserves PostgreSQL microsecond ordering in date groups', () => {
    const items = [
      activity('a', '2026-09-18T15:00:00.123001Z'),
      activity('z', '2026-09-18T15:00:00.123999Z'),
    ];
    expect(groupActivities(items)[0].items.map((a) => a.id)).toEqual(['z', 'a']);
  });
  it('uses AND filters and exact importance, searches project names', () => {
    const items = [
      activity('1'),
      activity('2', ago(20), { importance: 'high' }),
      activity('3', ago(30), { category: 'project' }),
    ];
    expect(
      filterActivities(items, {
        search: 'personal',
        category: 'source_control',
        importance: 'normal',
        projectId: 'desk',
      }).map((a) => a.id),
    ).toEqual(['1']);
    expect(filterActivities(items, { search: 'FAILED' })).toHaveLength(3);
  });
  it('dashboard excludes low, old, future and caps at five', () => {
    const items = [
      activity('low', now, { importance: 'low' }),
      activity('old', ago(604801)),
      activity('boundary', ago(604800)),
      activity('future', ago(-1)),
      ...Array.from({ length: 6 }, (_, i) => activity(String(i), ago(i))),
    ];
    expect(recentActivities(items, now).map((a) => a.id)).toEqual(['0', '1', '2', '3', '4']);
    expect(recentActivities([items[2]], now)).toHaveLength(1);
  });
  it('groups and sorts by Tokyo date across UTC midnight', () => {
    const items = [
      activity('yesterday', '2026-09-18T14:59:59Z'),
      activity('today', '2026-09-18T15:00:00Z'),
    ];
    expect(groupActivities(items).map((g) => g.date)).toEqual(['2026-09-19', '2026-09-18']);
    expect(dateGroup(items[1].occurredAt, now)).toBe('today');
    expect(dateGroup(items[0].occurredAt, now)).toBe('yesterday');
    expect(dateGroup('2026-09-16T15:00:00Z', now)).toBe('2026/09/17');
    expect(formatDate('2026-09-18T15:00:00Z')).toBe('2026/09/19');
  });
  it('prefers internal navigation and rejects unsafe external URLs', () => {
    expect(activityDestination(activity('1'))).toBe('/projects/desk');
    expect(activityDestination(activity('2', now, { projectSlug: null, systemName: 'VPS' }))).toBe(
      '/infrastructure',
    );
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('https://example.com')).toBe('https://example.com/');
  });
});
describe('freshness', () => {
  it('becomes stale at five minutes, never changes provider status', () => {
    expect(isStale(ago(299), now)).toBe(false);
    expect(isStale(ago(300), now)).toBe(true);
    expect(isStale(null, now)).toBe(false);
    expect(effectiveHealth({ status: 'down', lastSuccessAt: ago(300) }, now)).toBe('stale');
    expect(effectiveHealth({ status: 'healthy', lastSuccessAt: null }, now)).toBe('unknown');
    expect(effectiveHealth({ status: 'healthy', lastSuccessAt: 'invalid' }, now)).toBe('unknown');
    expect(effectiveHealth({ status: 'down', lastSuccessAt: ago(20) }, now)).toBe('down');
  });
  it('uses per-backup threshold (strictly exceeded) and preserves failed/running', () => {
    expect(effectiveBackup(backup(), now)).toBe('success');
    expect(effectiveBackup(backup({ lastSuccessAt: ago(108000) }), now)).toBe('success');
    expect(effectiveBackup(backup({ lastSuccessAt: ago(108001) }), now)).toBe('stale');
    expect(effectiveBackup(backup({ status: 'failed', lastSuccessAt: ago(200000) }), now)).toBe(
      'failed',
    );
    expect(effectiveBackup(backup({ status: 'running', lastSuccessAt: null }), now)).toBe(
      'running',
    );
    expect(effectiveBackup(backup({ lastSuccessAt: null }), now)).toBe('unknown');
  });
});
describe('infrastructure', () => {
  const system = {
    id: 'vps',
    name: 'VPS',
    status: 'healthy' as const,
    lastSuccessAt: now,
    lastCheckedAt: now,
    sortOrder: 0,
    cpuUsage: 18,
    memoryUsage: 42,
    diskUsage: 61,
    monitoringUrl: null,
  };
  it('aggregates down, alerts, backups, stale, unknown and empty', () => {
    expect(overallStatus(empty, now)).toBe('unknown');
    expect(overallStatus({ ...empty, systems: [system] }, now)).toBe('healthy');
    expect(
      overallStatus({ ...empty, systems: [{ ...system, lastSuccessAt: ago(301) }] }, now),
    ).toBe('warning');
    expect(overallStatus({ ...empty, systems: [{ ...system, lastSuccessAt: null }] }, now)).toBe(
      'warning',
    );
    expect(overallStatus({ ...empty, systems: [{ ...system, status: 'down' }] }, now)).toBe('down');
    expect(overallStatus({ ...empty, backups: [backup({ status: 'failed' })] }, now)).toBe(
      'warning',
    );
    const alert = {
      id: 'a',
      title: '',
      description: '',
      severity: 'critical' as const,
      status: 'active' as const,
      systemId: null,
      serviceId: null,
      startedAt: now,
      externalUrl: null,
    };
    expect(overallStatus({ ...empty, alerts: [alert] }, now)).toBe('down');
    expect(
      overallStatus(
        { ...empty, systems: [system], alerts: [{ ...alert, status: 'resolved' }] },
        now,
      ),
    ).toBe('healthy');
    expect(
      overallStatus(
        { ...empty, systems: [system], alerts: [{ ...alert, severity: 'warning' }] },
        now,
      ),
    ).toBe('warning');
  });
  it('sorts problems first and excludes resolved alerts', () => {
    expect(
      orderMonitored(
        [
          system,
          { ...system, id: 'stale', lastSuccessAt: ago(300) },
          { ...system, id: 'down', status: 'down' },
        ],
        now,
      ).map((s) => s.id),
    ).toEqual(['down', 'stale', 'vps']);
    expect(
      orderBackups(
        [
          backup(),
          backup({ id: 'failed', status: 'failed' }),
          backup({ id: 'stale', lastSuccessAt: ago(200000) }),
        ],
        now,
      ).map((b) => b.id),
    ).toEqual(['failed', 'stale', 'b']);
    expect(
      activeAlerts([
        {
          id: 'resolved',
          title: '',
          description: '',
          severity: 'critical',
          status: 'resolved',
          systemId: null,
          serviceId: null,
          startedAt: now,
          externalUrl: null,
        },
      ]),
    ).toEqual([]);
  });
});
describe('today', () => {
  it('selects only upcoming timed events on the current Tokyo day', () => {
    const event = {
      id: 'e',
      title: '',
      startsAt: ago(-100),
      endsAt: ago(-200),
      cancelled: false,
      allDay: false,
    };
    expect(
      nextEvent(
        [
          { ...event, id: 'past', startsAt: ago(1) },
          { ...event, id: 'all-day', allDay: true },
          { ...event, id: 'cancelled', cancelled: true },
          { ...event, id: 'tomorrow', startsAt: ago(-86400) },
          event,
        ],
        now,
      )?.id,
    ).toBe('e');
  });
  it('ranks overdue before today, then provider priority; handles all-day dates', () => {
    const task = {
      id: 'today',
      projectId: null,
      title: '',
      status: 'todo' as const,
      priority: 'urgent' as const,
      dueAt: '2026-09-19T00:00:00+09:00',
      allDay: true,
    };
    expect(
      todayTasks(
        [
          task,
          { ...task, id: 'overdue', dueAt: ago(86400), priority: 'low' },
          { ...task, id: 'done', status: 'done' },
          { ...task, id: 'future', dueAt: ago(-86400) },
        ],
        now,
      ).map((t) => t.id),
    ).toEqual(['overdue', 'today']);
    expect(dayDifference('2026-09-20T00:00:00+09:00', now)).toBe(1);
  });
  it('chooses nearest pending milestone including overdue', () => {
    const milestone = {
      id: 'm',
      projectId: 'desk',
      title: '',
      status: 'pending' as const,
      dueAt: ago(-86400),
      allDay: true,
    };
    expect(
      nextMilestone(
        [
          milestone,
          { ...milestone, id: 'overdue', dueAt: ago(86400) },
          { ...milestone, id: 'done', status: 'completed', dueAt: ago(200000) },
        ],
        'desk',
      )?.id,
    ).toBe('overdue');
  });
});
