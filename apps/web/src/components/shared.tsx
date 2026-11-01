import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock3,
  HelpCircle,
  Loader2,
  OctagonX,
  TriangleAlert,
} from 'lucide-react';
import { formatDateTime, safeExternalUrl, type SectionState } from '@personal-desk/core';
import {
  backupLabels,
  healthLabels,
  importanceLabels,
  projectLabels,
  relativeTime,
  severityLabels,
  t,
} from '@personal-desk/i18n';
import type { ReactNode } from 'react';
import { Button } from './ui/button';

const labels = { ...projectLabels, ...backupLabels, ...healthLabels, ...importanceLabels };
export function StatusBadge({ status, label }: { status: keyof typeof labels; label?: string }) {
  const Icon = ['down', 'failed', 'blocked', 'critical'].includes(status)
    ? OctagonX
    : ['warning', 'high'].includes(status)
      ? TriangleAlert
      : status === 'unknown'
        ? HelpCircle
        : ['stale', 'waiting'].includes(status)
          ? Clock3
          : ['healthy', 'success', 'done'].includes(status)
            ? CheckCircle2
            : Circle;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={13} aria-hidden="true" />
      {label ?? labels[status]}
    </span>
  );
}
export const SeverityBadge = ({ severity }: { severity: keyof typeof severityLabels }) => (
  <StatusBadge status={severity} label={severityLabels[severity]} />
);
export function RelativeTime({ value, now }: { value: string | null; now: string }) {
  return value ? (
    <time dateTime={value} title={formatDateTime(value)}>
      {relativeTime(value, now)}
    </time>
  ) : (
    <span>{t('common.unknown')}</span>
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Panel({
  title,
  href,
  children,
  className = '',
}: {
  title: string;
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`} aria-label={title}>
      <div className="panel-header">
        <h2>{title}</h2>
        {href && (
          <Link className="text-link" href={href}>
            {t('common.viewAll')} <span aria-hidden="true">↗</span>
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
export function EmptyState({
  message = t('common.empty'),
  children,
}: {
  message?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Circle size={24} aria-hidden="true" />
      <p>{message}</p>
      {children}
    </div>
  );
}
export function ErrorState({
  message = t('common.error'),
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={19} aria-hidden="true" />
      <p>{message}</p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div className="skeleton-group" role="status" aria-label={t('common.loading')}>
      <span className="sr-only">{t('common.loading')}</span>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function SectionContent({
  state = {},
  empty,
  emptyMessage,
  errorMessage,
  children,
  retry,
}: {
  state?: SectionState;
  empty: boolean;
  emptyMessage?: string;
  errorMessage?: string;
  children: ReactNode;
  retry?: () => void;
}) {
  if (state.loading && empty) return <LoadingSkeleton />;
  if (state.error && empty) return <ErrorState message={errorMessage} retry={retry} />;
  if (empty) return <EmptyState message={emptyMessage} />;
  return (
    <>
      {state.error && <ErrorState message={t('common.cachedError')} retry={retry} />}
      {state.stale && (
        <p className="notice">
          <Clock3 size={15} aria-hidden="true" />
          {t('common.stale')}
        </p>
      )}
      {(state.error || state.stale) && state.lastSuccessAt && (
        <p className="muted freshness">
          {t('common.updated')}: {formatDateTime(state.lastSuccessAt)}
        </p>
      )}
      {state.loading && (
        <p className="notice" role="status">
          <Loader2 size={14} />
          {t('common.refreshing')}
        </p>
      )}
      {children}
    </>
  );
}
export function ExternalLink({ href, children }: { href: string | null; children: ReactNode }) {
  const safe = safeExternalUrl(href);
  return safe ? (
    <a className="text-link" href={safe} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only"> ({t('common.external')})</span>
    </a>
  ) : (
    <span>{children}</span>
  );
}
