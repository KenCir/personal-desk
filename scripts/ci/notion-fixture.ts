// Test-only preload. Production never imports this module or changes its API endpoint.
import { fixturePages, fixtureSchemas, ids } from '../../packages/integrations/src/notion/fixtures';
import type { SourceKind } from '../../packages/integrations/src/notion/types';

if (process.env.DESK_DOCKER_TEST !== 'true' || process.env.NOTION_TOKEN !== 'fixture-only')
  throw new Error('fixture_preload_requires_test_credentials');
const pages = fixturePages();
const schemas = fixtureSchemas();
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith('https://api.notion.com/v1/data_sources/'))
    throw new Error('fixture_network_denied');
  const kind = Object.entries(ids).find(([, id]) => url.includes(id))?.[0] as
    SourceKind | undefined;
  if (!kind) throw new Error('fixture_unknown_source');
  if (process.env.DESK_FIXTURE_WAIT === 'true') {
    await new Promise<never>((_, reject) => {
      if (init?.signal?.aborted) return reject(new Error('aborted'));
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  }
  if (url.endsWith('/query')) {
    const body = JSON.parse(init?.body as string);
    return Response.json({
      results: body.is_archived ? [] : pages[kind],
      has_more: false,
      next_cursor: null,
    });
  }
  const schema = schemas.find((row) => row.source === kind)!;
  return Response.json({
    object: 'data_source',
    id: ids[kind],
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
};
