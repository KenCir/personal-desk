import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockData } from '@/lib/mock-data';
import { createMockDataSource } from '@/lib/data-sources/mock';
import { parseActivityRequest } from '@/lib/activity-request';
import { ProjectList } from './projects/project-list';
import { ActivityTimeline } from './activity/activity-timeline';
import { SectionContent, StatusBadge } from './shared';
import { TodayCard } from './dashboard/today-card';
import { AlertRow } from './infrastructure/infrastructure-view';

const data = createMockData('2026-09-19T00:00:00Z');
const source = createMockDataSource(data);
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const { query } = parseActivityRequest(new URL(url, 'http://localhost').searchParams);
      return { ok: true, json: () => source.getActivities(query) };
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
describe('project interactions', () => {
  it('collapses done by default, supports keyboard expansion and auto-expands search matches', async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={data.projects} areas={data.areas} now={data.now} />);
    expect(screen.queryByRole('link', { name: /ポートフォリオ更新/ })).not.toBeInTheDocument();
    const done = screen.getByRole('button', { name: /完了したプロジェクト/ });
    done.focus();
    await user.keyboard('{Enter}');
    expect(done).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /ポートフォリオ更新/ })).toHaveAttribute(
      'href',
      '/projects/portfolio',
    );
    await user.type(screen.getByRole('textbox'), 'ポートフォリオ');
    expect(screen.getByRole('link', { name: /ポートフォリオ更新/ })).toBeVisible();
    await user.selectOptions(screen.getByRole('combobox', { name: 'ステータス' }), 'active');
    expect(screen.getByText('条件に一致するプロジェクトがありません。')).toBeVisible();
  });
});
describe('activity interactions', () => {
  it('loads thirty more and resets pagination for AND filters', async () => {
    const user = userEvent.setup();
    render(
      <ActivityTimeline
        initialPage={await source.getActivities()}
        projects={data.projects}
        now={data.now}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    await user.click(screen.getByRole('button', { name: 'さらに読み込む' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(60));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'プロジェクト' }),
      'personal-desk',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    await user.selectOptions(screen.getByRole('combobox', { name: '重要度' }), 'low');
    expect(screen.getAllByRole('listitem').length).toBeLessThan(30);
    screen
      .getAllByRole('listitem')
      .forEach((item) => expect(within(item).getByText('Low')).toBeVisible());
    await user.type(screen.getByRole('textbox'), '一致しない検索');
    expect(screen.getByText('条件に一致するアクティビティがありません。')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'フィルタをクリア' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
  });
  it('project scope includes low and never leaks other projects', async () => {
    render(
      <ActivityTimeline
        initialPage={await source.getActivities({ projectId: 'personal-desk' })}
        projects={data.projects}
        now={data.now}
        projectId="personal-desk"
      />,
    );
    expect(screen.getAllByText('Low').length).toBeGreaterThan(0);
    expect(screen.queryByRole('combobox', { name: 'プロジェクト' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    expect(screen.queryByText('VPS')).not.toBeInTheDocument();
  });
  it('retains cached rows on fetch failure and retries the failed page', async () => {
    const user = userEvent.setup();
    render(
      <ActivityTimeline
        initialPage={await source.getActivities()}
        projects={data.projects}
        now={data.now}
      />,
    );
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'さらに読み込む' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    expect(screen.queryByText('アクティビティはまだありません。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(60));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
describe('section states', () => {
  it('shows disconnected Calendar without claiming there are no events', () => {
    render(<TodayCard data={{ ...data, events: [], calendarStatus: 'disconnected' }} />);
    expect(screen.getByText('Google Calendarは未接続です。')).toBeVisible();
    expect(screen.queryByText('今日はこのあとの予定はありません。')).not.toBeInTheDocument();
    expect(screen.queryByText(/次の予定/)).not.toBeInTheDocument();
  });
  it('shows the related backup for a backup-only alert', () => {
    render(
      <AlertRow
        alert={{ ...data.alerts[0], backupId: data.backups[0].id, systemId: null, serviceId: null }}
        data={data}
        now={data.now}
      />,
    );
    expect(screen.getByText(/Immich Backup/)).toBeVisible();
  });
  it('retains cached children on error, distinguishes empty, and exposes loading', () => {
    const { rerender } = render(
      <SectionContent state={{ error: true }} empty={false}>
        <p>cached content</p>
      </SectionContent>,
    );
    expect(screen.getByText('cached content')).toBeVisible();
    expect(screen.getByRole('alert')).toBeVisible();
    rerender(
      <SectionContent state={{ error: true }} empty>
        <p>cached content</p>
      </SectionContent>,
    );
    expect(screen.queryByText('表示するデータがありません。')).not.toBeInTheDocument();
    rerender(
      <SectionContent empty>
        <p>content</p>
      </SectionContent>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('表示するデータがありません。')).toBeVisible();
    rerender(
      <SectionContent state={{ loading: true }} empty>
        <p>content</p>
      </SectionContent>,
    );
    expect(screen.getByRole('status', { name: '読み込み中' })).toBeVisible();
  });
  it('communicates status in text', () => {
    render(<StatusBadge status="stale" />);
    expect(screen.getByText('情報が古い')).toBeVisible();
  });
});
