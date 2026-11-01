import { expect, test } from '@playwright/test';

test('dashboard, project navigation and scoped tabs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ダッシュボード', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass('dark');
  await expect(page.locator('.dashboard-top > section')).toHaveCount(2);
  await expect(page.locator('.project-row')).toHaveCount(5);
  await expect(page.locator('.activity-item')).toHaveCount(5);
  await page.screenshot({ path: 'test-results/dashboard-dark.png', fullPage: true });
  await page.getByRole('link', { name: 'プロジェクト', exact: true }).click();
  await expect(page.getByRole('button', { name: /完了したプロジェクト/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.getByRole('textbox').fill('Personal Desk');
  await expect(page.locator('.project-row')).toHaveCount(1);
  await page.locator('.project-row').click();
  await expect(page).toHaveURL('/projects/personal-desk');
  await page
    .getByRole('navigation', { name: 'プロジェクトのページ' })
    .getByRole('link', { name: 'アクティビティ' })
    .click();
  await expect(page.locator('.activity-item')).toHaveCount(30);
  await expect(page.getByText('Low', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'さらに読み込む' }).click();
  await expect.poll(() => page.locator('.activity-item').count()).toBeGreaterThan(30);
  await page
    .getByRole('navigation', { name: 'プロジェクトのページ' })
    .getByRole('link', { name: 'リソース' })
    .click();
  await expect(page.getByRole('heading', { name: '開発', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /GitHub Repository/ })).toHaveAttribute(
    'target',
    '_blank',
  );
  await page.goto('/projects/does-not-exist');
  await expect(page.getByText('プロジェクトが見つかりません')).toBeVisible();
  expect(errors).toEqual([]);
});

test('activity filtering and thirty-row pagination', async ({ page }) => {
  await page.goto('/activity');
  await expect(page.locator('.activity-item')).toHaveCount(30);
  await page.getByRole('button', { name: 'さらに読み込む' }).click();
  await expect(page.locator('.activity-item')).toHaveCount(60);
  await page
    .getByRole('combobox', { name: 'プロジェクト', exact: true })
    .selectOption('personal-desk');
  await expect(page.locator('.activity-item')).toHaveCount(30);
  await page.getByRole('combobox', { name: '重要度' }).selectOption('high');
  await expect.poll(() => page.locator('.activity-item').count()).toBeLessThan(30);
  await page.getByRole('textbox').fill('存在しないイベント');
  await expect(page.getByText('条件に一致するアクティビティがありません。')).toBeVisible();
  await page.getByRole('button', { name: 'フィルタをクリア' }).click();
  await expect(page.locator('.activity-item')).toHaveCount(30);
  await page.screenshot({ path: 'test-results/activity-dark.png', fullPage: true });
});

test('infrastructure, theme persistence and sidebar breakpoint', async ({ page }) => {
  await page.goto('/infrastructure');
  await expect(page.getByRole('heading', { name: '重大な問題があります' })).toBeVisible();
  await expect(page.getByText('情報が古い').first()).toBeVisible();
  await expect(page.getByText('不明', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Database Backupの失敗' })).toHaveCount(0);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await expect(page.getByRole('button', { name: '更新', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/infrastructure-dark.png', fullPage: true });
  await page.getByRole('combobox', { name: 'テーマ' }).selectOption('light');
  await expect(page.locator('html')).toHaveClass('light');
  await page.reload();
  await expect(page.locator('html')).toHaveClass('light');
  await page.screenshot({ path: 'test-results/infrastructure-light.png', fullPage: true });
  for (const width of [1440, 1280, 1279, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width)).toBe(
      width < 1280 ? 72 : 240,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: 'test-results/infrastructure-narrow.png', fullPage: true });
  await page.getByRole('combobox', { name: 'テーマ' }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveClass('dark');
});

test('independent fetch states preserve cached content and retry', async ({ page }) => {
  await page.goto('/?state=error&section=event');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(1);
  await expect(page.locator('.project-row')).toHaveCount(5);
  await page.getByRole('button', { name: '再試行' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.goto('/infrastructure?state=cached&section=services');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(1);
  await expect(
    page
      .getByRole('region', { name: 'サービス', exact: true })
      .getByRole('heading', { name: /^Immich/ }),
  ).toBeVisible();
  await page.goto('/activity?state=empty');
  await expect(page.getByText('アクティビティはまだありません。')).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.goto('/?state=loading&section=event');
  await expect(page.getByRole('status', { name: '読み込み中' })).toBeVisible();
  await expect(page.locator('.project-row')).toHaveCount(5);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '表示状態のプレビュー' })).toBeVisible();
});
