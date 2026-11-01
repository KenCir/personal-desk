import Link from 'next/link';
import { t } from '@personal-desk/i18n';
import { ThemeButtons } from '@/components/app-shell';
import { PageHeader, Panel } from '@/components/shared';
import { dataSourceMode } from '@/lib/data-sources/config';
export const dynamic = 'force-dynamic';
export default function SettingsPage() {
  return (
    <>
      <PageHeader title={t('nav.settings')} description={t('settings.description')} />
      <div className="page-stack">
        <Panel title={t('theme.title')}>
          <div className="panel-body">
            <ThemeButtons />
          </div>
        </Panel>
        <Panel title={t('settings.integration')}>
          <p className="panel-body muted">
            {t(
              dataSourceMode(process.env.DATA_SOURCE) === 'database'
                ? 'settings.databaseHelp'
                : 'settings.integrationHelp',
            )}
          </p>
        </Panel>
        <Panel title={t('settings.preview')}>
          <div className="panel-body">
            <p className="muted">{t('settings.previewHelp')}</p>
            <div className="preview-links">
              {(['Ready', 'Loading', 'Empty', 'Error', 'Cached', 'Stale'] as const).map((mode) => (
                <Link key={mode} href={`/?state=${mode.toLowerCase()}`}>
                  {t(`settings.preview${mode}`)}
                </Link>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
