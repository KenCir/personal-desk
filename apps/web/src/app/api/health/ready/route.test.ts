// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const { ready } = vi.hoisted(() => ({ ready: vi.fn() }));
vi.mock('@/lib/data-sources/database', () => ({ getWebDatabase: () => ({ ready }) }));
import { GET } from './route';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  vi.useRealTimers();
});
it('only reports readiness after database checks succeed', async () => {
  vi.stubEnv('DATA_SOURCE', 'database');
  ready.mockResolvedValue(undefined);
  expect((await GET()).status).toBe(200);
  vi.stubEnv('DATA_SOURCE', 'mock');
  expect((await GET()).status).toBe(503);
});
it('does not expose database errors', async () => {
  vi.stubEnv('DATA_SOURCE', 'database');
  ready.mockRejectedValue(new Error('postgres://user:password@host/db'));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'unavailable' });
});
it('bounds HTTP waiting for a stalled pool', async () => {
  vi.useFakeTimers();
  vi.stubEnv('DATA_SOURCE', 'database');
  ready.mockReturnValue(new Promise(() => {}));
  const response = GET();
  await vi.advanceTimersByTimeAsync(3000);
  expect((await response).status).toBe(503);
});
