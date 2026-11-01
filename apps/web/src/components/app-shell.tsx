'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from 'next-themes';
import {
  Activity,
  Boxes,
  FolderKanban,
  LayoutDashboard,
  Monitor,
  Moon,
  Settings,
  Sun,
  Zap,
} from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { t } from '@personal-desk/i18n';

const subscribe = () => () => {};
export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div className="theme-control">
      <label htmlFor="theme-select">
        <Moon size={16} aria-hidden="true" />
        <span className="sidebar-label">{t('theme.title')}</span>
      </label>
      <select
        id="theme-select"
        aria-label={t('theme.title')}
        value={mounted ? theme : 'dark'}
        onChange={(e) => setTheme(e.target.value)}
      >
        <option value="dark">{t('theme.dark')}</option>
        <option value="light">{t('theme.light')}</option>
        <option value="system">{t('theme.system')}</option>
      </select>
    </div>
  );
}
export function ThemeButtons() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div className="theme-options">
      {(
        [
          ['dark', Moon],
          ['light', Sun],
          ['system', Monitor],
        ] as const
      ).map(([value, Icon]) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-pressed={mounted && theme === value}
        >
          <Icon size={22} />
          {t(`theme.${value}`)}
        </button>
      ))}
    </div>
  );
}
export function AppSidebar({ database = false }: { database?: boolean }) {
  const pathname = usePathname();
  const links = [
    ['/', 'dashboard', LayoutDashboard],
    ['/projects', 'projects', FolderKanban],
    ['/activity', 'activity', Activity],
    ['/infrastructure', 'infrastructure', Boxes],
    ['/settings', 'settings', Settings],
  ] as const;
  return (
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Personal Desk">
        <span className="brand-mark">
          <Zap size={22} fill="currentColor" />
        </span>
        <span className="sidebar-label">
          Personal Desk<span className="brand-subtitle">{t('app.workspace')}</span>
        </span>
      </Link>
      <nav aria-label={t('app.name')}>
        {links.map(([href, key, Icon]) => (
          <Link
            key={href}
            href={href}
            title={t(`nav.${key}`)}
            aria-current={
              (href === '/' ? pathname === '/' : pathname.startsWith(href)) ? 'page' : undefined
            }
          >
            <Icon size={19} aria-hidden="true" />
            <span className="sidebar-label">{t(`nav.${key}`)}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sample-label">
          <span className="sample-dot" />
          <span className="sidebar-label">
            {t(database ? 'common.database' : 'common.mock')} <small>v0.1</small>
          </span>
        </div>
        <ThemeSelect />
      </div>
    </aside>
  );
}
export function AppShell({
  children,
  database = false,
}: {
  children: ReactNode;
  database?: boolean;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <a className="skip-link" href="#main">
        {t('common.skip')}
      </a>
      <AppSidebar database={database} />
      <main id="main" className="main-shell">
        <div className="topbar">
          <span>
            WORKSPACE <span className="topbar-divider">/</span> Personal
          </span>
          <span className="muted">{t('common.readOnly')}</span>
        </div>
        <div className="main-content">{children}</div>
      </main>
    </ThemeProvider>
  );
}
