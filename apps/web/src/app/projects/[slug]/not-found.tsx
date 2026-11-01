import Link from 'next/link';
import { t } from '@personal-desk/i18n';
import { EmptyState } from '@/components/shared';
export default function ProjectNotFound() {
  return (
    <EmptyState message={t('projects.notFound')}>
      <Link className="text-link" href="/projects">
        {t('common.back')}
      </Link>
    </EmptyState>
  );
}
