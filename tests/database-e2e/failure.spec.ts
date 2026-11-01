import { expect, test } from '@playwright/test';

test('connection failure is an error, never empty or mock data', async ({ page, request }) => {
  test.setTimeout(60000);
  for (const route of ['/', '/projects', '/activity', '/infrastructure']) {
    await page.goto(route);
    await expect(
      page.getByRole('alert').filter({ hasText: 'データを取得できませんでした。' }),
    ).toBeVisible();
    await expect(page.getByText('サンプルデータ', { exact: true })).toHaveCount(0);
    await expect(page.getByText('プロジェクトがありません。')).toHaveCount(0);
    await expect(page.getByText('アクティビティはまだありません。')).toHaveCount(0);
  }
  const response = await request.get('/api/activity');
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: 'read_failed' });
});
