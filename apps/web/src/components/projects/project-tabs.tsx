'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t } from '@personal-desk/i18n';
export function ProjectTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/projects/${slug}`;
  return (
    <nav className="tabs" aria-label={t('project.tabs')}>
      {[
        [base, t('project.overview')],
        [`${base}/activity`, t('nav.activity')],
        [`${base}/resources`, t('project.resources')],
      ].map(([href, title]) => (
        <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
          {title}
        </Link>
      ))}
    </nav>
  );
}
