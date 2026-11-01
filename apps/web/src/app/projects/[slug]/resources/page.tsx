import { getProject } from '@/lib/project';
import { ResourceList } from '@/components/projects/resource-list';
export default async function ProjectResources({ params }: { params: Promise<{ slug: string }> }) {
  const { source, now, project } = await getProject((await params).slug);
  const resources = await source.getResources(project.id);
  return <ResourceList resources={resources} now={now} />;
}
