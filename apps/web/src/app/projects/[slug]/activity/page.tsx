import { getProject } from '@/lib/project';
import { ActivityTimeline } from '@/components/activity/activity-timeline';
export default async function ProjectActivity({ params }: { params: Promise<{ slug: string }> }) {
  const { source, now, project } = await getProject((await params).slug);
  const initialPage = await source.getActivities({ projectId: project.id, until: now });
  return (
    <ActivityTimeline
      initialPage={initialPage}
      projects={[project]}
      projectId={project.id}
      now={now}
    />
  );
}
