'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Server } from 'lucide-react';
import {
  activeAlerts,
  effectiveBackup,
  effectiveHealth,
  orderBackups,
  orderMonitored,
  overallStatus,
  type Alert,
  type Backup,
  type Infrastructure,
  type Service,
  type System,
} from '@personal-desk/core';
import { backupLabels, t } from '@personal-desk/i18n';
import { DataSection } from '../preview';
import {
  ExternalLink,
  PageHeader,
  Panel,
  RelativeTime,
  SeverityBadge,
  StatusBadge,
} from '../shared';
import { Button } from '../ui/button';

function useClock(initial: string) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return Date.parse(initial) > Date.parse(now) ? initial : now;
}
export function InfrastructureSummary({
  data,
  initialNow,
}: {
  data: Infrastructure;
  initialNow: string;
}) {
  const now = useClock(initialNow);
  const status = overallStatus(data, now);
  return (
    <Panel title={t('nav.infrastructure')} href="/infrastructure">
      <DataSection
        name="infrastructure"
        now={now}
        empty={
          !data.systems.length &&
          !data.services.length &&
          !data.backups.length &&
          !data.alerts.length
        }
      >
        <div className="summary-status">
          <StatusBadge status={status} />
          <span className="muted text-xs">
            {t('infrastructure.alerts')} {activeAlerts(data.alerts).length}
          </span>
        </div>
        {[...data.systems, ...data.services.slice(0, 2)].map((e) => (
          <div className="summary-row" key={e.id}>
            <span>{e.name}</span>
            <StatusBadge status={effectiveHealth(e, now)} />
          </div>
        ))}
        {data.backups.slice(0, 1).map((b) => (
          <div className="summary-row" key={b.id}>
            <span>
              {b.name}
              <small className="block">
                {t('infrastructure.lastSuccess')}:{' '}
                <RelativeTime value={b.lastSuccessAt} now={now} />
              </small>
            </span>
            <StatusBadge
              status={effectiveBackup(b, now)}
              label={backupLabels[effectiveBackup(b, now)]}
            />
          </div>
        ))}
      </DataSection>
    </Panel>
  );
}
export function SystemCard({ system, now }: { system: System; now: string }) {
  const status = effectiveHealth(system, now);
  return (
    <article className="system-card">
      <header>
        <h3>{system.name}</h3>
        <StatusBadge status={status} />
      </header>
      <div className="metrics">
        {(
          [
            ['cpu', system.cpuUsage],
            ['memory', system.memoryUsage],
            ['disk', system.diskUsage],
          ] as const
        ).map(([key, value]) => (
          <div key={key}>
            <p className="metric-label">{t(`infrastructure.${key}`)}</p>
            <p className="metric-value">{value === null ? '—' : `${value}%`}</p>
          </div>
        ))}
      </div>
      {status === 'stale' && <p className="notice !px-0">{t('common.stale')}</p>}
      <footer className="system-footer">
        <span>
          {t('infrastructure.lastCheck')}: <RelativeTime value={system.lastCheckedAt} now={now} />
          {' · '}
          {t('infrastructure.lastSuccess')}: <RelativeTime value={system.lastSuccessAt} now={now} />
        </span>
        {system.monitoringUrl && (
          <ExternalLink href={system.monitoringUrl}>{t('infrastructure.monitoring')}</ExternalLink>
        )}
      </footer>
    </article>
  );
}
export function ServiceRow({
  service,
  systems,
  now,
}: {
  service: Service;
  systems: System[];
  now: string;
}) {
  return (
    <article className="infra-row">
      <h3>
        <ExternalLink href={service.resourceUrl}>{service.name}</ExternalLink>
      </h3>
      <StatusBadge status={effectiveHealth(service, now)} />
      <div className="infra-meta">
        <span>
          {t('infrastructure.host')}:{' '}
          {systems.find((s) => s.id === service.systemId)?.name ?? t('common.none')}
        </span>
        <span>
          {t('infrastructure.lastCheck')}: <RelativeTime value={service.lastCheckedAt} now={now} />
          {' · '}
          {t('infrastructure.lastSuccess')}:{' '}
          <RelativeTime value={service.lastSuccessAt} now={now} />
        </span>
      </div>
    </article>
  );
}
export function BackupRow({ backup, now }: { backup: Backup; now: string }) {
  return (
    <article className="infra-row">
      <div>
        <h3>{backup.name}</h3>
        {backup.lastError && <p className="error-detail">{backup.lastError}</p>}
      </div>
      <StatusBadge
        status={effectiveBackup(backup, now)}
        label={backupLabels[effectiveBackup(backup, now)]}
      />
      <div className="infra-meta">
        <span>
          {t('infrastructure.lastSuccess')}: <RelativeTime value={backup.lastSuccessAt} now={now} />
        </span>
        <span>
          {t('infrastructure.lastAttempt')}: <RelativeTime value={backup.lastAttemptAt} now={now} />
        </span>
      </div>
    </article>
  );
}
export function AlertRow({
  alert,
  data,
  now,
}: {
  alert: Alert;
  data: Infrastructure;
  now: string;
}) {
  const target =
    data.backups.find((b) => b.id === alert.backupId)?.name ??
    data.services.find((s) => s.id === alert.serviceId)?.name ??
    data.systems.find((s) => s.id === alert.systemId)?.name;
  return (
    <article className="infra-row">
      <div>
        <h3>
          <ExternalLink href={alert.externalUrl}>{alert.title}</ExternalLink>
        </h3>
        <p>{alert.description}</p>
        <p>
          {target} · {t('infrastructure.started')}:{' '}
          <RelativeTime value={alert.startedAt} now={now} />
        </p>
      </div>
      <SeverityBadge severity={alert.severity} />
    </article>
  );
}
export function InfrastructureView({
  data,
  initialNow,
}: {
  data: Infrastructure;
  initialNow: string;
}) {
  const now = useClock(initialNow);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const alerts = activeAlerts(data.alerts);
  const status = overallStatus(data, now);
  const lastUpdate =
    [...data.systems, ...data.services]
      .map((s) => s.lastSuccessAt)
      .filter((v): v is string => !!v)
      .sort()
      .at(-1) ?? null;
  return (
    <>
      <PageHeader
        title={t('nav.infrastructure')}
        description={t('infrastructure.description')}
        action={
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            <RefreshCw size={15} />
            {t(pending ? 'common.refreshing' : 'common.refresh')}
          </Button>
        }
      />
      <div className="page-stack" aria-busy={pending}>
        <Panel title={t('infrastructure.overall')}>
          <DataSection
            name="overall"
            now={now}
            empty={
              !data.systems.length &&
              !data.services.length &&
              !data.backups.length &&
              !data.alerts.length
            }
          >
            <div className="overall-card">
              <span className="overall-icon">
                <Server size={23} />
              </span>
              <div>
                <h2>
                  {t(
                    status === 'healthy'
                      ? 'infrastructure.healthy'
                      : status === 'down'
                        ? 'infrastructure.down'
                        : status === 'unknown'
                          ? 'infrastructure.unknown'
                          : 'infrastructure.warning',
                  )}
                </h2>
                <p>
                  {t('common.updated')}: <RelativeTime value={lastUpdate} now={now} />
                </p>
              </div>
              <StatusBadge status={status} />
            </div>
          </DataSection>
        </Panel>
        <Panel title={t('infrastructure.systems')}>
          <DataSection
            name="systems"
            now={now}
            empty={!data.systems.length}
            emptyMessage={t('infrastructure.noSystems')}
          >
            <div className="systems-grid">
              {orderMonitored(data.systems, now).map((s) => (
                <SystemCard key={s.id} system={s} now={now} />
              ))}
            </div>
          </DataSection>
        </Panel>
        <Panel title={t('infrastructure.services')}>
          <DataSection
            name="services"
            now={now}
            empty={!data.services.length}
            emptyMessage={t('infrastructure.noServices')}
          >
            {orderMonitored(data.services, now).map((s) => (
              <ServiceRow key={s.id} service={s} systems={data.systems} now={now} />
            ))}
          </DataSection>
        </Panel>
        <Panel title={t('infrastructure.backups')}>
          <DataSection
            name="backups"
            now={now}
            empty={!data.backups.length}
            emptyMessage={t('infrastructure.noBackups')}
          >
            {orderBackups(data.backups, now).map((b) => (
              <BackupRow key={b.id} backup={b} now={now} />
            ))}
          </DataSection>
        </Panel>
        <Panel title={t('infrastructure.alerts')}>
          <DataSection
            name="alerts"
            now={now}
            empty={!alerts.length}
            emptyMessage={t('infrastructure.noAlerts')}
          >
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} data={data} now={now} />
            ))}
          </DataSection>
        </Panel>
      </div>
    </>
  );
}
