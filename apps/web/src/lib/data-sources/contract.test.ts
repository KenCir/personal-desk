import { describe, expect, it } from 'vitest';
import { createMockData } from '../mock-data';
import { createMockDataSource } from './mock';
import { databaseUrl, dataSourceMode } from './config';
import { parseActivityRequest } from '../activity-request';

describe('data source selection and activity request', () => {
  it('defaults to mock but rejects misspellings and missing DB configuration', () => {
    expect(dataSourceMode(undefined)).toBe('mock');
    expect(dataSourceMode('database')).toBe('database');
    expect(() => dataSourceMode('databse')).toThrow();
    expect(() => dataSourceMode('')).toThrow();
    expect(() => databaseUrl(undefined)).toThrow();
    expect(() => databaseUrl('https://example.com')).toThrow();
  });
  it('requires an explicit source in production while retaining development compatibility', () => {
    expect(dataSourceMode(undefined, 'development')).toBe('mock');
    expect(() => dataSourceMode(undefined, 'production')).toThrow('explicitly');
    expect(dataSourceMode('mock', 'production')).toBe('mock');
    expect(dataSourceMode('database', 'production')).toBe('database');
  });
  it('validates API filters/cursors and fixes page size at 30', () => {
    const result = parseActivityRequest(
      new URLSearchParams({
        now: '2026-09-19T00:00:00Z',
        category: 'source_control',
        importance: 'low',
        limit: '100000',
      }),
    );
    expect(result.query.limit).toBe(30);
    expect(result.query.category).toBe('source_control');
    const invalidQueries: Record<string, string>[] = [
      { category: 'unknown' },
      { importance: 'urgent' },
      { cursor: 'null' },
      { cursor: '{invalid' },
      { now: 'invalid' },
    ];
    for (const params of invalidQueries)
      expect(() => parseActivityRequest(new URLSearchParams(params))).toThrow();
  });
  it('mock follows the same paged read contract across requests with a shared clock', async () => {
    const now = '2026-09-19T00:00:00Z';
    const firstSource = createMockDataSource(createMockData(now));
    const first = await firstSource.getActivities();
    const secondSource = createMockDataSource(createMockData(now));
    const second = await secondSource.getActivities({ cursor: first.nextCursor });
    expect(first.items).toHaveLength(30);
    expect(second.items).toHaveLength(30);
    expect(new Set([...first.items, ...second.items].map((a) => a.id)).size).toBe(60);
    expect(await firstSource.getProjectBySlug('missing')).toBeNull();
    expect((await firstSource.getInfrastructure()).alerts.every((a) => a.status === 'active')).toBe(
      true,
    );
  });
});
