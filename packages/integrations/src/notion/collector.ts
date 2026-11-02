import { NOTION_VERSION } from './config';
import { setTimeout as delay } from 'node:timers/promises';
import {
  array,
  NotionSyncError,
  notionId,
  object,
  sourceKinds,
  string,
  type JsonObject,
  type Mapping,
  type ResolvedMapping,
  type SourceIds,
  type SourceKind,
  type Issue,
  type ResolvedProperty,
  type CollectionRequest,
} from './types';

type Transport = (url: string, init: RequestInit) => Promise<Response>;
interface ClientOptions {
  fetch?: Transport;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  signal?: AbortSignal;
}
/** Only read endpoints are exposed; POST is restricted to data source queries. */
export class NotionCollector {
  private nextRequestAt = 0;
  private transport: Transport;
  private sleep: (milliseconds: number) => Promise<void>;
  private now: () => number;
  private intervalMs: number;
  private signal?: AbortSignal;
  constructor(
    private token: string,
    options: ClientOptions = {},
  ) {
    if (!token.trim()) throw new NotionSyncError('missing_notion_token');
    this.transport = options.fetch ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) => delay(milliseconds, undefined, { signal: options.signal }));
    this.now = options.now ?? Date.now;
    this.intervalMs = options.intervalMs ?? 350;
    this.signal = options.signal;
  }
  private async request(path: string, body?: JsonObject): Promise<JsonObject> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.signal?.aborted) throw new NotionSyncError('notion_sync_aborted');
      await this.sleep(Math.max(0, this.nextRequestAt - this.now()));
      this.nextRequestAt = this.now() + this.intervalMs;
      let response: Response;
      try {
        response = await this.transport(`https://api.notion.com/v1/${path}`, {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.any([
            AbortSignal.timeout(15000),
            ...(this.signal ? [this.signal] : []),
          ]),
          redirect: 'error',
        });
      } catch {
        if (this.signal?.aborted) throw new NotionSyncError('notion_sync_aborted');
        if (attempt === 2) throw new NotionSyncError('notion_network_error');
        this.nextRequestAt = this.now() + 1000 * 2 ** attempt;
        continue;
      }
      if (response.ok) {
        try {
          return object(await response.json());
        } catch {
          throw new NotionSyncError('invalid_notion_response');
        }
      }
      // Never expose API messages or transport exceptions; they may contain credentials/content.
      const errorBody = await response.json().catch(() => null);
      const blocked =
        errorBody &&
        typeof errorBody === 'object' &&
        errorBody.additional_data?.rate_limit_reason === 'public_api_request_blocked';
      if (blocked) throw new NotionSyncError('notion_access_blocked');
      if (response.status !== 429 && response.status < 500)
        throw new NotionSyncError(`notion_http_${response.status}`);
      const retryAfter = response.headers.get('retry-after');
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const retryDate = retryAfter === null ? NaN : Date.parse(retryAfter);
      const delay =
        Number.isFinite(seconds) && seconds >= 0
          ? seconds * 1000
          : Number.isFinite(retryDate)
            ? Math.max(0, retryDate - this.now())
            : 1000 * 2 ** attempt;
      const retryAt = new Date(Math.min(8.64e15, this.now() + delay)).toISOString();
      // Preserve even the last response's Retry-After for the next scheduled attempt.
      if (attempt === 2) throw new NotionSyncError(`notion_http_${response.status}`, retryAt);
      // Do not retry earlier than requested; a long pause is reported for manual re-run.
      if (delay > 60000) {
        throw new NotionSyncError('notion_retry_later', retryAt);
      }
      this.nextRequestAt = this.now() + delay;
    }
    throw new NotionSyncError('notion_retry_exhausted');
  }
  getDatabase(id: string) {
    return this.request(`databases/${notionId(id)}`);
  }
  getDataSource(id: string) {
    return this.request(`data_sources/${notionId(id)}`);
  }
  private async list(path: string, body?: JsonObject): Promise<unknown[]> {
    const result: unknown[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const query = new URLSearchParams({
        page_size: '100',
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      const page = body
        ? await this.request(path, {
            ...body,
            page_size: 100,
            ...(cursor ? { start_cursor: cursor } : {}),
          })
        : await this.request(`${path}?${query}`);
      result.push(...array(page.results));
      if (page.has_more === false) return result;
      if (
        page.has_more !== true ||
        typeof page.next_cursor !== 'string' ||
        !page.next_cursor ||
        seen.has(page.next_cursor)
      )
        throw new NotionSyncError('invalid_pagination');
      cursor = page.next_cursor;
      seen.add(cursor);
    } while (cursor);
    return result;
  }
  async getPages(
    id: string,
    properties: (ResolvedProperty | null)[],
    request?: CollectionRequest,
  ): Promise<unknown[]> {
    const filter = request?.since
      ? {
          filter: {
            timestamp: 'last_edited_time',
            last_edited_time: { on_or_after: request.since },
          },
        }
      : {};
    const path = `data_sources/${notionId(id)}/query`;
    const pages = await this.list(path, filter);
    // Automated and manual synchronization request both active and explicitly archived pages.
    // Inspection callers can retain the active-only query by omitting the request.
    if (request) pages.push(...(await this.list(path, { ...filter, is_archived: true })));
    const selected = new Set(properties.filter((p) => p !== null).map((p) => p.id));
    for (const value of pages) {
      const page = object(value);
      if (page.object !== 'page') throw new NotionSyncError('unexpected_data_source_item');
      if (page.in_trash === true || page.archived === true) continue;
      for (const property of Object.values(object(page.properties))) {
        const prop = object(property);
        if (!selected.has(string(prop.id))) continue;
        const type = string(prop.type);
        const shouldHydrate =
          (type === 'relation' && prop.has_more === true) ||
          (['title', 'rich_text'].includes(type) &&
            Array.isArray(prop[type]) &&
            (prop[type] as unknown[]).length >= 25);
        if (!shouldHydrate) continue;
        let propertyId: string;
        try {
          propertyId = encodeURIComponent(decodeURIComponent(string(prop.id)));
        } catch {
          throw new NotionSyncError('invalid_property_id');
        }
        const items = await this.list(`pages/${notionId(page.id)}/properties/${propertyId}`);
        prop[type] = items.map((item) => {
          const entry = object(item);
          if (entry.type !== type) throw new NotionSyncError('invalid_property_response');
          return entry[type];
        });
        prop.has_more = false;
      }
    }
    return pages;
  }
}

export interface SchemaReport {
  source: SourceKind;
  id: string;
  databaseId: string | null;
  properties: {
    id: string;
    name: string;
    type: string;
    options?: string[];
    relationDataSourceId?: string;
  }[];
}
export function inspectSchema(raw: unknown, source: SourceKind, expectedId: string): SchemaReport {
  const schema = object(raw);
  if (
    schema.object !== 'data_source' ||
    notionId(schema.id) !== expectedId ||
    schema.in_trash === true
  )
    throw new NotionSyncError('invalid_data_source');
  const parent = schema.parent ? object(schema.parent) : {};
  return {
    source,
    id: expectedId,
    databaseId: typeof parent.database_id === 'string' ? notionId(parent.database_id) : null,
    properties: Object.entries(object(schema.properties)).map(([name, rawProperty]) => {
      const property = object(rawProperty);
      const type = string(property.type);
      const details = property[type] ? object(property[type]) : {};
      return {
        id: string(property.id),
        name,
        type,
        ...(['status', 'select', 'multi_select'].includes(type)
          ? { options: array(details.options).map((value) => string(object(value).name)) }
          : {}),
        ...(type === 'relation' && typeof details.data_source_id === 'string'
          ? { relationDataSourceId: notionId(details.data_source_id) }
          : {}),
      };
    }),
  };
}
export function validateSchemas(reports: SchemaReport[], mapping: Mapping, ids: SourceIds) {
  const resolved = { areas: {}, projects: {}, tasks: {} } as ResolvedMapping;
  const issues: Issue[] = [];
  for (const source of sourceKinds) {
    const report = reports.find((r) => r.source === source);
    if (!report || report.id !== ids[source])
      throw new NotionSyncError('missing_data_source_schema');
    for (const [field, ref] of Object.entries(mapping[source])) {
      if (ref === null) {
        Object.assign(resolved[source], { [field]: null });
        continue;
      }
      const matches = report.properties.filter(
        (p) => p.name === ref.property || p.id === ref.property,
      );
      if (matches.length !== 1 || matches[0].type !== ref.type) {
        issues.push({ code: 'property_mapping_mismatch', source, field });
        continue;
      }
      const property = matches[0];
      const target =
        source === 'projects' && field === 'area'
          ? ids.areas
          : source === 'tasks' && field === 'project'
            ? ids.projects
            : null;
      if (target && property.relationDataSourceId !== target) {
        issues.push({ code: 'relation_schema_mismatch', source, field });
        continue;
      }
      const statuses =
        field === 'status'
          ? source === 'projects'
            ? mapping.projectStatuses
            : mapping.taskStatuses
          : source === 'tasks' && field === 'priority'
            ? mapping.taskPriorities
            : null;
      if (statuses && property.options?.some((option) => !Object.hasOwn(statuses, option)))
        issues.push({ code: 'unmapped_schema_option', source, field });
      Object.assign(resolved[source], {
        [field]: { ...ref, id: property.id, name: property.name },
      });
    }
    const used = Object.values(resolved[source])
      .filter((p) => p !== null)
      .map((p) => p.id);
    if (new Set(used).size !== used.length)
      issues.push({ code: 'duplicate_property_mapping', source });
  }
  return { resolved, issues };
}
