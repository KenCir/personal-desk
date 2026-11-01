import { t } from '@personal-desk/i18n';
import { getProject } from '@/lib/project';
import { Panel, RelativeTime, StatusBadge } from '@/components/shared';
import { DataSection } from '@/components/preview';
import { MilestoneContent } from '@/components/dashboard/today-card';
import { ResourceRows } from '@/components/projects/resource-list';
import { RecentActivity } from '@/components/activity/activity-timeline';
export default async function ProjectOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { source, now, project } = await getProject((await params).slug);
  const [milestone, allResources, activityPage] = await Promise.all([
    source.getNextMilestone(project.id),
    source.getResources(project.id),
    source.getActivities({
      projectId: project.id,
      minimumImportance: 'normal',
      until: now,
      limit: 5,
    }),
  ]);
  const resources = allResources
    .filter((r) => r.isPrimary)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 6);
  const activity = activityPage.items;
  return (
    <div className="page-stack">
      <div className="overview-grid">
        <Panel title={t('project.summary')}>
          <div className="panel-body">
            <dl className="summary-dl">
              <dt>{t('projects.status')}</dt>
              <dd>
                <StatusBadge status={project.status} />
              </dd>
              <dt>{t('projects.area')}</dt>
              <dd>{project.areaName ?? t('common.none')}</dd>
              <dt>{t('common.updated')}</dt>
              <dd>
                <RelativeTime value={project.updatedAt} now={now} />
              </dd>
            </dl>
          </div>
        </Panel>
        <Panel title={t('project.nextMilestone')}>
          <DataSection
            name="milestone"
            now={now}
            empty={!milestone}
            emptyMessage={t('dashboard.noDeadline')}
          >
            {milestone && (
              <div className="panel-body">
                <MilestoneContent milestone={milestone} projects={[project]} now={now} />
              </div>
            )}
          </DataSection>
        </Panel>
      </div>
      <Panel title={t('project.linkedResources')} href={`/projects/${project.slug}/resources`}>
        <DataSection
          name="resources"
          now={now}
          empty={!resources.length}
          emptyMessage={t('project.noResources')}
        >
          <ResourceRows resources={resources} />
        </DataSection>
      </Panel>
      <Panel title={t('dashboard.recentActivity')} href={`/projects/${project.slug}/activity`}>
        <DataSection
          name="activity"
          now={now}
          empty={!activity.length}
          emptyMessage={t('activity.empty')}
        >
          <RecentActivity activities={activity} now={now} />
        </DataSection>
      </Panel>
    </div>
  );
}
