// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { NotionCollector } from './collector';
import { collectNotion } from './sync';
import { defaultMapping } from './config';
import { fixturePages, fixtureSchemas, ids } from './fixtures';
import type { SourceKind } from './types';

function transport() {
  const pages = fixturePages();
  const schemas = fixtureSchemas();
  return vi.fn(async (url: string) => {
    const kind = Object.entries(ids).find(([, id]) => url.includes(id))![0] as SourceKind;
    if (url.endsWith('/query'))
      return Response.json({ results: pages[kind], has_more: false, next_cursor: null });
    const schema = schemas.find((s) => s.source === kind)!;
    return Response.json({
      object: 'data_source',
      id: ids[kind],
      parent: { database_id: schema.databaseId },
      properties: Object.fromEntries(
        schema.properties.map((p) => [
          p.name,
          {
            id: p.id,
            type: p.type,
            [p.type]: p.options
              ? { options: p.options.map((name) => ({ name })) }
              : p.relationDataSourceId
                ? { data_source_id: p.relationDataSourceId }
                : {},
          },
        ]),
      ),
    });
  });
}
it('runs schema validation before fetching and normalizing the three datasets', async () => {
  const fetch = transport();
  const result = await collectNotion(
    new NotionCollector('test', { fetch, intervalMs: 0 }),
    ids,
    defaultMapping,
  );
  expect(result.fatal).toBe(false);
  expect(result.batch.issues).toEqual([]);
  expect(result.batch.fetched).toEqual({ areas: 1, projects: 1, tasks: 2 });
  expect(fetch.mock.calls.slice(0, 3).every(([url]) => !url.endsWith('/query'))).toBe(true);
  expect(fetch.mock.calls.slice(3).every(([url]) => url.endsWith('/query'))).toBe(true);
});
it('stops before collection on a property type mismatch instead of guessing a mapping', async () => {
  const fetch = transport();
  const mapping = structuredClone(defaultMapping);
  mapping.projects.status.type = 'select';
  const result = await collectNotion(
    new NotionCollector('test', { fetch, intervalMs: 0 }),
    ids,
    mapping,
  );
  expect(result.fatal).toBe(true);
  expect(result.batch.projects).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('discards incomplete collections on API failure while reporting fetched counts', async () => {
  const base = transport();
  const fetch = vi.fn(async (url: string) =>
    url.includes(ids.projects) && url.endsWith('/query')
      ? Response.json({ message: 'private response' }, { status: 403 })
      : base(url),
  );
  const result = await collectNotion(
    new NotionCollector('test', { fetch, intervalMs: 0 }),
    ids,
    defaultMapping,
  );
  expect(result.fatal).toBe(true);
  expect(result.batch.areas).toEqual([]);
  expect(result.batch.projects).toEqual([]);
  expect(result.batch.fetched.areas).toBe(1);
  expect(result.batch.issues).toEqual([{ code: 'notion_http_403' }]);
  expect(JSON.stringify(result)).not.toContain('private response');
});
