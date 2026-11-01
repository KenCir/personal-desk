import { t } from '@personal-desk/i18n';
import { getReadContext } from '@/lib/data';
import { PageHeader } from '@/components/shared';
import { ProjectList } from '@/components/projects/project-list';
export const dynamic = 'force-dynamic';
export default async function ProjectsPage() {
  const { source, now } = getReadContext();
  const [projects, areas] = await Promise.all([source.getProjects(), source.getAreas()]);
  return (
    <>
      <PageHeader title={t('nav.projects')} description={t('projects.description')} />
      <ProjectList projects={projects} areas={areas} now={now} />
    </>
  );
}
