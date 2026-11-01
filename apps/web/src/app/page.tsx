import { activeProjects, recentActivities } from '@personal-desk/core';
import { t } from '@personal-desk/i18n';
import { getDeskData } from '@/lib/data';
import { PageHeader, Panel } from '@/components/shared';
import { DataSection } from '@/components/preview';
import { TodayCard } from '@/components/dashboard/today-card';
import { InfrastructureSummary } from '@/components/infrastructure/infrastructure-view';
import { ProjectRow } from '@/components/projects/project-list';
import { RecentActivity } from '@/components/activity/activity-timeline';
export const dynamic = 'force-dynamic';
export default async function DashboardPage() {
  const data = await getDeskData();
  const projects = activeProjects(data.projects);
  const activity = recentActivities(data.activities, data.now);
  return (
    <>
      <PageHeader title={t('nav.dashboard')} description={t('dashboard.description')} />
      <div className="page-stack">
        <div className="dashboard-top">
          <TodayCard data={data} />
          <InfrastructureSummary data={data} initialNow={data.now} />
        </div>
        <Panel title={t('dashboard.activeProjects')} href="/projects">
          <DataSection
            name="projects"
            now={data.now}
            empty={!projects.length}
            emptyMessage={t('projects.empty')}
          >
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} now={data.now} />
            ))}
          </DataSection>
        </Panel>
        <Panel title={t('dashboard.recentActivity')} href="/activity">
          <DataSection
            name="activity"
            now={data.now}
            empty={!activity.length}
            emptyMessage={t('activity.empty')}
          >
            <RecentActivity activities={activity} now={data.now} />
          </DataSection>
        </Panel>
      </div>
    </>
  );
}
