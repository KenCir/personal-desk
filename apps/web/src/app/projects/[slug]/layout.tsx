import Link from 'next/link';
import { t } from '@personal-desk/i18n';
import { getProject } from '@/lib/project';
import { PageHeader, RelativeTime, StatusBadge } from '@/components/shared';
import { ProjectTabs } from '@/components/projects/project-tabs';
export const dynamic = 'force-dynamic';
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { project, now } = await getProject((await params).slug);
  return (
    <>
      <Link className="text-link back-link" href="/projects">
        ← {t('common.back')}
      </Link>
      <PageHeader title={project.name} description={project.description} />
      <div className="project-heading-meta">
        <StatusBadge status={project.status} />
        <span>{project.areaName ?? t('common.none')}</span>
        <span>
          {t('common.updated')}: <RelativeTime value={project.updatedAt} now={now} />
        </span>
      </div>
      <ProjectTabs slug={project.slug} />
      {children}
    </>
  );
}
