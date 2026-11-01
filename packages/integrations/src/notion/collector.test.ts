// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NotionCollector } from './collector';
import { id, ids, page, prop, title } from './fixtures';
import { NOTION_VERSION } from './config';

const response = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers });
const list = (results: unknown[], next: string | null = null) => ({
  object: 'list',
  results,
  has_more: next !== null,
  next_cursor: next,
});
const options = () => ({
  intervalMs: 0,
  now: () => 0,
  sleep: vi.fn(async (milliseconds: number) => {
    expect(milliseconds).toBeGreaterThanOrEqual(0);
  }),
});

describe('read-only Notion collector', () => {
  it('uses pinned API version, paginates with opaque cursors and never exposes write endpoints', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        response(list([page(id(1), 'areas', { Name: title('name', 'A') })], 'opaque:next/session')),
      )
      .mockResolvedValueOnce(response(list([page(id(2), 'areas', { Name: title('name', 'B') })])));
    const client = new NotionCollector('test-token', { ...options(), fetch: transport });
    expect(await client.getPages(ids.areas, [])).toHaveLength(2);
    expect(transport.mock.calls[0][0]).toBe(
      `https://api.notion.com/v1/data_sources/${ids.areas}/query`,
    );
    expect(transport.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Bearer test-token', 'Notion-Version': NOTION_VERSION },
    });
    expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({
      page_size: 100,
      start_cursor: 'opaque:next/session',
    });
  });
  it('hydrates truncated configured page properties with pagination', async () => {
    const item = page(id(1), 'areas', {
      Name: prop(
        'name',
        'title',
        Array.from({ length: 25 }, () => ({ plain_text: 'x' })),
      ),
    });
    const transport = vi
      .fn()
      .mockResolvedValueOnce(response(list([item])))
      .mockResolvedValueOnce(
        response(list([{ type: 'title', title: { plain_text: 'first' } }], 'next')),
      )
      .mockResolvedValueOnce(response(list([{ type: 'title', title: { plain_text: 'second' } }])));
    const client = new NotionCollector('test-token', { ...options(), fetch: transport });
    const result = await client.getPages(ids.areas, [
      { id: 'name', name: 'Name', property: 'Name', type: 'title' },
    ]);
    expect(result[0]).toMatchObject({
      properties: { Name: { title: [{ plain_text: 'first' }, { plain_text: 'second' }] } },
    });
    expect(transport.mock.calls.slice(1).every((call) => call[1].method === 'GET')).toBe(true);
  });
  it('obeys Retry-After for 429/529 and bounds retries for server/network failures', async () => {
    const clock = options();
    const transport = vi
      .fn()
      .mockResolvedValueOnce(response({}, 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(response({}, 529, { 'retry-after': '3' }))
      .mockResolvedValueOnce(response({ object: 'data_source' }));
    await new NotionCollector('token', { ...clock, fetch: transport }).getDataSource(ids.areas);
    expect(clock.sleep.mock.calls.map((call) => call[0])).toEqual([0, 2000, 3000]);
    const failed = vi.fn(async () => response({ message: 'ntn_secret' }, 503));
    await expect(
      new NotionCollector('token', { ...options(), fetch: failed }).getDataSource(ids.areas),
    ).rejects.toThrow('notion_http_503');
    expect(failed).toHaveBeenCalledTimes(3);
    const network = vi.fn(async () => {
      throw new Error('token contains secret');
    });
    await expect(
      new NotionCollector('token', { ...options(), fetch: network }).getDataSource(ids.areas),
    ).rejects.toThrow('notion_network_error');
    expect(network).toHaveBeenCalledTimes(3);
  });
  it.each([400, 401, 403, 404])(
    'never retries permanent HTTP %i or includes raw response messages',
    async (code) => {
      const transport = vi.fn(async () =>
        response({ message: 'token secret private payload' }, code),
      );
      await expect(
        new NotionCollector('token', { ...options(), fetch: transport }).getDataSource(ids.areas),
      ).rejects.toThrow(`notion_http_${code}`);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it('does not retry a blocked connection or retry earlier than a long server delay', async () => {
    const blocked = vi.fn(async () =>
      response({ additional_data: { rate_limit_reason: 'public_api_request_blocked' } }, 429),
    );
    await expect(
      new NotionCollector('token', { ...options(), fetch: blocked }).getDataSource(ids.areas),
    ).rejects.toThrow('notion_access_blocked');
    expect(blocked).toHaveBeenCalledTimes(1);
    const limited = vi.fn(async () => response({}, 429, { 'retry-after': '120' }));
    await expect(
      new NotionCollector('token', { ...options(), fetch: limited }).getDataSource(ids.areas),
    ).rejects.toThrow('notion_retry_later');
    expect(limited).toHaveBeenCalledTimes(1);
  });
  it('fails on a pagination error instead of returning a misleading partial collection', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(response(list([page(id(1), 'areas', {})], 'repeat')))
      .mockResolvedValueOnce(response(list([], 'repeat')));
    await expect(
      new NotionCollector('token', { ...options(), fetch: transport }).getPages(ids.areas, []),
    ).rejects.toThrow('invalid_pagination');
  });
});
