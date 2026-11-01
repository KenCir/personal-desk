import { Temporal } from '@js-temporal/polyfill';
import {
  array,
  NotionSyncError,
  notionId,
  object,
  sourceKinds,
  string,
  safeIssue,
  type JsonObject,
  type Mapping,
  type NormalizedArea,
  type NormalizedBatch,
  type NormalizedDate,
  type NormalizedProject,
  type NormalizedTask,
  type ResolvedMapping,
  type ResolvedProperty,
  type SourceIds,
  type SourceKind,
} from './types';

export function instant(value: unknown): string {
  try {
    return Temporal.Instant.from(string(value)).toString();
  } catch {
    throw new NotionSyncError('invalid_timestamp');
  }
}
export function normalizeDate(value: unknown): NormalizedDate | null {
  if (value === null) return null;
  const date = object(value);
  const start = string(date.start);
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      const day = Temporal.PlainDate.from(start);
      return {
        at: day
          .toZonedDateTime({ timeZone: 'Asia/Tokyo', plainTime: '00:00' })
          .toInstant()
          .toString(),
        allDay: true,
      };
    }
    if (typeof date.time_zone === 'string' && date.time_zone) {
      const value = Temporal.ZonedDateTime.from(`${start}[${date.time_zone}]`, {
        disambiguation: 'reject',
        offset: 'reject',
      });
      return { at: value.toInstant().toString(), allDay: false };
    }
    return { at: Temporal.Instant.from(start).toString(), allDay: false };
  } catch {
    throw new NotionSyncError('invalid_date');
  }
}
export function githubRepository(value: unknown): { url: string; name: string } | null {
  if (value === null) return null;
  try {
    const url = new URL(string(value));
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.hostname.toLowerCase() !== 'github.com' ||
      url.port ||
      url.username ||
      url.password
    )
      throw new Error();
    const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '');
    const match = /^\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+)$/.exec(path);
    if (!match || ['.', '..'].includes(match[2])) throw new Error();
    const [, owner, repo] = match;
    return {
      url: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
      name: repo.toLowerCase(),
    };
  } catch {
    throw new NotionSyncError('invalid_github_repository_url');
  }
}
function property(page: JsonObject, ref: ResolvedProperty | null): JsonObject | null {
  if (!ref) return null;
  const matches = Object.values(object(page.properties))
    .map(object)
    .filter((p) => p.id === ref.id);
  if (matches.length !== 1 || matches[0].type !== ref.type)
    throw new NotionSyncError('page_property_mismatch');
  return matches[0];
}
function text(value: unknown): string {
  return array(value)
    .map((part) => {
      const item = object(part);
      if (typeof item.plain_text === 'string') return item.plain_text;
      if (item.type === 'text') return string(object(item.text).content);
      throw new NotionSyncError('incomplete_rich_text');
    })
    .join('');
}
function title(page: JsonObject, ref: ResolvedProperty | null): string {
  if (!ref) throw new NotionSyncError('missing_title_mapping');
  const result = text(property(page, ref)![ref.type]).trim();
  if (!result) throw new NotionSyncError('empty_title');
  return result;
}
function option(page: JsonObject, ref: ResolvedProperty | null): string | null {
  if (!ref) return null;
  const value = property(page, ref)![ref.type];
  return value === null ? null : string(object(value).name);
}
function mapped<T extends string>(value: string | null, mapping: Record<string, T>): T {
  if (value === null || !Object.hasOwn(mapping, value))
    throw new NotionSyncError('unsupported_status');
  return mapping[value];
}
function relation(page: JsonObject, ref: ResolvedProperty | null): string | null {
  if (!ref) throw new NotionSyncError('missing_relation_mapping');
  const prop = property(page, ref)!;
  const related = array(prop.relation);
  if (prop.has_more === true || related.length > 1)
    throw new NotionSyncError('multiple_or_incomplete_relation');
  return related.length ? notionId(object(related[0]).id) : null;
}
function common(page: JsonObject, source: SourceKind, ids: SourceIds) {
  const parent = object(page.parent);
  if (
    page.object !== 'page' ||
    parent.type !== 'data_source_id' ||
    notionId(parent.data_source_id) !== ids[source]
  )
    throw new NotionSyncError('unexpected_page_parent');
  return { externalId: notionId(page.id), sourceUpdatedAt: instant(page.last_edited_time) };
}
function normalizeArea(page: JsonObject, refs: ResolvedMapping, ids: SourceIds): NormalizedArea {
  return { ...common(page, 'areas', ids), name: title(page, refs.areas.name) };
}
function normalizeProject(
  page: JsonObject,
  refs: ResolvedMapping,
  mapping: Mapping,
  ids: SourceIds,
): NormalizedProject {
  const fields = refs.projects;
  return {
    ...common(page, 'projects', ids),
    name: title(page, fields.name),
    description: fields.description ? text(property(page, fields.description)!.rich_text) : null,
    status: mapped(option(page, fields.status), mapping.projectStatuses),
    areaExternalId: relation(page, fields.area),
    sourceCreatedAt: instant(page.created_time),
    deadline: fields.deadline ? normalizeDate(property(page, fields.deadline)!.date) : null,
    github: fields.github ? githubRepository(property(page, fields.github)!.url) : null,
    managesDescription: fields.description !== null,
    managesDeadline: fields.deadline !== null,
    managesGithub: fields.github !== null,
  };
}
function normalizeTask(
  page: JsonObject,
  refs: ResolvedMapping,
  mapping: Mapping,
  ids: SourceIds,
): NormalizedTask {
  const fields = refs.tasks;
  const priority = option(page, fields.priority);
  const type = property(page, fields.type);
  let sourceType: string[] = [];
  if (fields.type && type) {
    const value = type[fields.type.type];
    sourceType =
      fields.type.type === 'rich_text'
        ? [text(value)]
        : fields.type.type === 'multi_select'
          ? array(value).map((item) => string(object(item).name))
          : value === null
            ? []
            : [string(object(value).name)];
  }
  return {
    ...common(page, 'tasks', ids),
    title: title(page, fields.title),
    status: mapped(option(page, fields.status), mapping.taskStatuses),
    projectExternalId: relation(page, fields.project),
    due: fields.due ? normalizeDate(property(page, fields.due)!.date) : null,
    priority: priority === null ? null : mapped(priority, mapping.taskPriorities),
    sourceType,
    managesDue: fields.due !== null,
    managesPriority: fields.priority !== null,
  };
}
export function normalizeBatch(
  pages: Record<SourceKind, unknown[]>,
  refs: ResolvedMapping,
  mapping: Mapping,
  ids: SourceIds,
): NormalizedBatch {
  const batch: NormalizedBatch = {
    areas: [],
    projects: [],
    tasks: [],
    fetched: { areas: 0, projects: 0, tasks: 0 },
    issues: [],
  };
  for (const source of sourceKinds) {
    batch.fetched[source] = pages[source].length;
    const seen = new Set<string>();
    for (const raw of pages[source]) {
      let externalId: string | undefined;
      try {
        const page = object(raw);
        externalId = notionId(page.id);
        if (seen.has(externalId)) throw new NotionSyncError('duplicate_page_in_collection');
        seen.add(externalId);
        if (page.in_trash === true || page.archived === true) {
          batch.issues.push({ code: 'archived_page_skipped', source, externalId });
          continue;
        }
        if (source === 'areas') batch.areas.push(normalizeArea(page, refs, ids));
        if (source === 'projects') batch.projects.push(normalizeProject(page, refs, mapping, ids));
        if (source === 'tasks') batch.tasks.push(normalizeTask(page, refs, mapping, ids));
      } catch (error) {
        batch.issues.push({ code: safeIssue(error), source, externalId });
      }
    }
  }
  return batch;
}
