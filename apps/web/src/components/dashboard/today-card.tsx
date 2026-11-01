import Link from 'next/link';
import { CalendarDays, Flag, ListTodo } from 'lucide-react';
import {
  dayDifference,
  formatDate,
  formatTime,
  nextEvent,
  nextMilestone,
  todayTasks,
  type DeskData,
  type Milestone,
  type Project,
} from '@personal-desk/core';
import { relativeTime, t } from '@personal-desk/i18n';
import { DataSection } from '../preview';
import { Panel } from '../shared';

export function MilestoneContent({
  milestone,
  projects,
  now,
}: {
  milestone: Milestone;
  projects: Project[];
  now: string;
}) {
  const project = projects.find((p) => p.id === milestone.projectId);
  const days = milestone.dueAt ? dayDifference(milestone.dueAt, now) : null;
  return (
    <>
      <p className="block-title">{milestone.title}</p>
      <div className="block-detail">
        {project && (
          <Link className="text-link" href={`/projects/${project.slug}`}>
            {project.name}
          </Link>
        )}
        {milestone.dueAt && <time dateTime={milestone.dueAt}>{formatDate(milestone.dueAt)}</time>}
        {days !== null && (
          <span className="block-value">
            {days === 0
              ? t('dashboard.dueToday')
              : t(days < 0 ? 'dashboard.overdue' : 'dashboard.remaining', {
                  count: Math.abs(days),
                })}
          </span>
        )}
      </div>
    </>
  );
}
export function TodayCard({ data }: { data: DeskData }) {
  const event = nextEvent(data.events, data.now);
  const tasks = todayTasks(data.tasks, data.now);
  const topTask = tasks.find((task) => task.status !== 'waiting');
  const milestone = nextMilestone(data.milestones);
  return (
    <Panel title={t('dashboard.today')}>
      <DataSection
        name="event"
        now={data.now}
        empty={!event}
        emptyMessage={t(
          data.calendarStatus === 'disconnected'
            ? 'dashboard.calendarDisconnected'
            : 'dashboard.noEvent',
        )}
      >
        {event && (
          <div className="today-block">
            <span className="block-icon">
              <CalendarDays size={18} />
            </span>
            <div className="block-content">
              <p className="eyebrow">
                {t('dashboard.nextEvent')} · {t('common.mock')}
              </p>
              <p className="block-title">{event.title}</p>
              <div className="block-detail">
                <time dateTime={event.startsAt}>{formatTime(event.startsAt)}</time>
                <span>{relativeTime(event.startsAt, data.now)}</span>
              </div>
            </div>
          </div>
        )}
      </DataSection>
      <DataSection
        name="tasks"
        now={data.now}
        empty={!tasks.length}
        emptyMessage={t('dashboard.noTask')}
      >
        {tasks.length > 0 && (
          <div className="today-block">
            <span className="block-icon">
              <ListTodo size={18} />
            </span>
            <div className="block-content">
              <p className="eyebrow">{t('dashboard.tasks')}</p>
              <p className="block-title">{topTask?.title ?? t('dashboard.waitingTasks')}</p>
              <p className="block-detail">{t('dashboard.taskCount', { count: tasks.length })}</p>
            </div>
          </div>
        )}
      </DataSection>
      <DataSection
        name="milestone"
        now={data.now}
        empty={!milestone}
        emptyMessage={t('dashboard.noDeadline')}
      >
        {milestone && (
          <div className="today-block">
            <span className="block-icon">
              <Flag size={18} />
            </span>
            <div className="block-content">
              <p className="eyebrow">{t('dashboard.deadline')}</p>
              <MilestoneContent milestone={milestone} projects={data.projects} now={data.now} />
            </div>
          </div>
        )}
      </DataSection>
    </Panel>
  );
}
