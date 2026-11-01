import { expect, test } from '@playwright/test';

test('empty database renders all main pages without sample data', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Google Calendarは未接続です。')).toBeVisible();
  await expect(page.getByText('今日対象の未完了タスクはありません。')).toBeVisible();
  await expect(page.getByText('予定されているマイルストーンはありません。')).toBeVisible();
  await expect(page.getByText('サンプルデータ', { exact: true })).toHaveCount(0);
  for (const [route, message] of [
    ['/projects', 'プロジェクトがありません。'],
    ['/activity', 'アクティビティはまだありません。'],
    ['/infrastructure', '監視対象のSystemがありません。'],
  ]) {
    expect((await page.goto(route))?.status()).toBe(200);
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.locator('.error-state')).toHaveCount(0);
  }
  const response = await request.get('/api/activity');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
  await page.goto('/projects/read-smoke-nonexistent-project');
  await expect(page.getByText('プロジェクトが見つかりません', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
