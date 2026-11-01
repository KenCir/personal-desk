import { t } from '@personal-desk/i18n';
import { getReadContext } from '@/lib/data';
import { PageHeader } from '@/components/shared';
import { ActivityTimeline } from '@/components/activity/activity-timeline';
export const dynamic = 'force-dynamic';
export default async function ActivityPage() {
  const { source, now } = getReadContext();
  const [initialPage, projects] = await Promise.all([
    source.getActivities({ until: now }),
    source.getProjects(),
  ]);
  return (
    <>
      <PageHeader title={t('nav.activity')} description={t('activity.description')} />
      <ActivityTimeline initialPage={initialPage} projects={projects} now={now} />
    </>
  );
}
