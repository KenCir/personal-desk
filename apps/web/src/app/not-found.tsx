import Link from 'next/link';
import { t } from '@personal-desk/i18n';
import { EmptyState } from '@/components/shared';
export default function NotFound() {
  return (
    <EmptyState message={t('common.notFound')}>
      <Link className="text-link" href="/">
        {t('common.home')}
      </Link>
    </EmptyState>
  );
}
