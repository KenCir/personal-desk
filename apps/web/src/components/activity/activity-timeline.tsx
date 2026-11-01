'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Activity as ActivityIcon, GitPullRequest, Search, Server } from 'lucide-react';
import {
  activityDestination,
  categories,
  dateGroup,
  type ActivityFilters,
  formatDateTime,
  formatTime,
  groupActivities,
  importances,
  type Activity,
  type ActivityPage,
  type Project,
} from '@personal-desk/core';
import { categoryLabels, importanceLabels, t } from '@personal-desk/i18n';
import { DataSection } from '../preview';
import { ExternalLink, RelativeTime, StatusBadge, SectionContent } from '../shared';
import { useActivityFeed } from './use-activity-feed';
import { Button } from '../ui/button';

export function ActivityItem({
  activity,
  now,
  compact = false,
}: {
  activity: Activity;
  now: string;
  compact?: boolean;
}) {
  const destination = activityDestination(activity);
  const Icon =
    activity.category === 'source_control'
      ? GitPullRequest
      : activity.category === 'infrastructure'
        ? Server
        : ActivityIcon;
  return (
    <li className="activity-item">
      <Icon size={17} aria-hidden="true" />
      <div className="activity-content">
        {destination?.startsWith('/') ? (
          <Link className="activity-title" href={destination}>
            {activity.title} <span aria-hidden="true">↗</span>
          </Link>
        ) : destination ? (
          <ExternalLink href={destination}>{activity.title}</ExternalLink>
        ) : (
          <p className="activity-title">{activity.title}</p>
        )}
        {!compact && activity.description && (
          <p className="activity-description">{activity.description}</p>
        )}
        <div className="activity-meta">
          {(activity.projectName || activity.systemName) && (
            <span>{activity.projectName ?? activity.systemName}</span>
          )}
          <span>{activity.provider}</span>
          <StatusBadge status={activity.importance} />
        </div>
      </div>
      <span className="activity-time">
        {compact ? (
          <RelativeTime value={activity.occurredAt} now={now} />
        ) : (
          <time dateTime={activity.occurredAt} title={formatDateTime(activity.occurredAt)}>
            {formatTime(activity.occurredAt)}
          </time>
        )}
      </span>
    </li>
  );
}
export function RecentActivity({ activities, now }: { activities: Activity[]; now: string }) {
  return (
    <ul className="activity-list">
      {activities.map((a) => (
        <ActivityItem key={a.id} activity={a} now={now} compact />
      ))}
    </ul>
  );
}
export function ActivityTimeline({
  initialPage,
  projects,
  now,
  projectId,
}: {
  initialPage: ActivityPage;
  projects: Project[];
  now: string;
  projectId?: string;
}) {
  const [query, setQuery] = useState<ActivityFilters>({});
  const { page, pending, error, load, retry } = useActivityFeed(initialPage, now, projectId);
  const filtered = !!(query.search || query.category || query.importance || query.projectId);
  function update(next: ActivityFilters) {
    setQuery(next);
    void load(next);
  }
  const visible = page.items;
  return (
    <>
      <div className="filters">
        {!projectId && (
          <label className="filter-field search-field">
            <span>{t('common.search')}</span>
            <div className="search-wrap">
              <Search size={16} aria-hidden="true" />
              <input
                value={query.search ?? ''}
                placeholder={t('activity.search')}
                onChange={(e) => update({ ...query, search: e.target.value })}
              />
            </div>
          </label>
        )}
        <label className="filter-field">
          <span>{t('activity.category')}</span>
          <select
            value={query.category ?? ''}
            onChange={(e) =>
              update({ ...query, category: e.target.value as ActivityFilters['category'] })
            }
          >
            <option value="">{t('common.all')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </label>
        {!projectId && (
          <>
            <label className="filter-field">
              <span>{t('activity.importance')}</span>
              <select
                value={query.importance ?? ''}
                onChange={(e) =>
                  update({ ...query, importance: e.target.value as ActivityFilters['importance'] })
                }
              >
                <option value="">{t('common.all')}</option>
                {[...importances].reverse().map((i) => (
                  <option key={i} value={i}>
                    {importanceLabels[i]}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>{t('activity.project')}</span>
              <select
                value={query.projectId ?? ''}
                onChange={(e) => update({ ...query, projectId: e.target.value })}
              >
                <option value="">{t('activity.allProjects')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {filtered && (
          <Button variant="ghost" onClick={() => update({})}>
            {t('common.clear')}
          </Button>
        )}
      </div>
      <p className="result-count" role="status">
        {t('common.results', { count: visible.length })}
      </p>
      <SectionContent
        state={{ loading: pending, error }}
        empty={!visible.length}
        emptyMessage={t(filtered ? 'activity.noMatch' : 'activity.empty')}
        errorMessage={t('activity.error')}
        retry={retry}
      >
        <DataSection
          name="activity"
          now={now}
          empty={!visible.length}
          emptyMessage={t(filtered ? 'activity.noMatch' : 'activity.empty')}
        >
          {groupActivities(visible).map((group) => {
            const label = dateGroup(group.items[0].occurredAt, now);
            const title =
              label === 'today'
                ? t('date.today')
                : label === 'yesterday'
                  ? t('date.yesterday')
                  : label;
            return (
              <section key={group.date} aria-label={title}>
                <h2 className="date-heading">{title}</h2>
                <ul className="activity-list panel">
                  {group.items.map((a) => (
                    <ActivityItem key={a.id} activity={a} now={now} />
                  ))}
                </ul>
              </section>
            );
          })}
          {page.nextCursor && (
            <div className="load-more">
              <Button
                variant="outline"
                disabled={pending || error}
                onClick={() => void load(query, page.nextCursor)}
              >
                {t(pending ? 'common.loading' : 'common.loadMore')}
              </Button>
            </div>
          )}
        </DataSection>
      </SectionContent>
    </>
  );
}
