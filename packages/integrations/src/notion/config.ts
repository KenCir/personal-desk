import { readFile } from 'node:fs/promises';
import { projectStatuses } from '@personal-desk/core';
import {
  NotionSyncError,
  notionId,
  object,
  sourceKinds,
  string,
  type Mapping,
  type PropertyMapping,
  type SourceIds,
} from './types';

export const NOTION_VERSION = '2026-03-11';
// Documented mapping is a starting configuration, never evidence of the live schema.
export const defaultMapping: Mapping = {
  areas: { name: { property: 'Name', type: 'title' } },
  projects: {
    name: { property: 'Name', type: 'title' },
    status: { property: 'Status', type: 'status' },
    area: { property: 'Area', type: 'relation' },
    description: null,
    deadline: { property: 'Deadline', type: 'date' },
    github: { property: 'GitHub', type: 'url' },
  },
  tasks: {
    title: { property: 'Task', type: 'title' },
    status: { property: 'Status', type: 'status' },
    project: { property: 'Project', type: 'relation' },
    due: { property: 'Due', type: 'date' },
    priority: { property: 'Priority', type: 'select' },
    type: { property: 'Type', type: 'select' },
  },
  projectStatuses: {
    Planning: 'planning',
    Active: 'active',
    Waiting: 'waiting',
    Paused: 'blocked',
    Done: 'done',
  },
  taskStatuses: { Todo: 'todo', Doing: 'in_progress', Waiting: 'waiting', Done: 'done' },
  taskPriorities: { Low: 'low', Medium: 'medium', High: 'high', Urgent: 'urgent' },
};
const allowedTypes: Record<string, readonly string[]> = {
  'areas.name': ['title'],
  'projects.name': ['title'],
  'projects.status': ['status', 'select'],
  'projects.area': ['relation'],
  'projects.description': ['rich_text'],
  'projects.deadline': ['date'],
  'projects.github': ['url'],
  'tasks.title': ['title'],
  'tasks.status': ['status', 'select'],
  'tasks.project': ['relation'],
  'tasks.due': ['date'],
  'tasks.priority': ['select', 'status'],
  'tasks.type': ['select', 'multi_select', 'rich_text'],
};
const optionalFields = new Set([
  'projects.description',
  'projects.deadline',
  'projects.github',
  'tasks.due',
  'tasks.priority',
  'tasks.type',
]);
export function parseMapping(input: unknown): Mapping {
  const parsed = object(input);
  const result = structuredClone(defaultMapping);
  for (const kind of sourceKinds) {
    const fields = object(parsed[kind]);
    for (const field of Object.keys(result[kind])) {
      const key = `${kind}.${field}`;
      const value = fields[field];
      if (value === null && optionalFields.has(key)) {
        (result[kind] as Record<string, PropertyMapping | null>)[field] = null;
        continue;
      }
      const ref = object(value);
      if (!string(ref.property).trim() || !allowedTypes[key].includes(string(ref.type)))
        throw new NotionSyncError('invalid_mapping');
      (result[kind] as Record<string, PropertyMapping | null>)[field] = {
        property: ref.property as string,
        type: ref.type as PropertyMapping['type'],
      };
    }
    if (Object.keys(fields).some((key) => !(key in result[kind])))
      throw new NotionSyncError('unknown_mapping_field');
  }
  for (const [key, allowed] of [
    ['projectStatuses', projectStatuses],
    ['taskStatuses', ['todo', 'in_progress', 'waiting', 'done', 'cancelled']],
    ['taskPriorities', ['low', 'medium', 'high', 'urgent']],
  ] as const) {
    const values = object(parsed[key]);
    if (
      !Object.keys(values).length ||
      Object.entries(values).some(
        ([name, value]) => !name || !(allowed as readonly unknown[]).includes(value),
      )
    )
      throw new NotionSyncError('invalid_status_mapping');
    Object.assign(result, { [key]: values });
  }
  if (Object.keys(parsed).some((key) => !(key in result)))
    throw new NotionSyncError('unknown_mapping_field');
  return result;
}
export async function loadMapping(path?: string) {
  if (!path) return structuredClone(defaultMapping);
  try {
    return parseMapping(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    throw new NotionSyncError('invalid_mapping_file');
  }
}
export function sourceIds(env: NodeJS.ProcessEnv): SourceIds {
  const result = {} as SourceIds;
  for (const kind of sourceKinds) {
    const value = env[`NOTION_${kind.toUpperCase()}_DATA_SOURCE_ID`];
    if (!value) throw new NotionSyncError(`missing_${kind}_data_source_id`);
    result[kind] = notionId(value);
  }
  if (new Set(Object.values(result)).size !== 3)
    throw new NotionSyncError('duplicate_data_source_id');
  return result;
}
export function databaseTarget(value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    if (
      [...url.searchParams.keys()].some((key) =>
        ['host', 'hostname', 'port', 'database', 'dbname'].includes(key.toLowerCase()),
      ) ||
      url.hostname.includes(',')
    )
      throw new Error();
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    )
      throw new Error();
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!/^[A-Za-z0-9_.-]+$/.test(database)) throw new Error();
    return {
      host: url.hostname,
      port: url.port || '5432',
      database,
      target: `${url.hostname}:${url.port || '5432'}/${database}`,
    };
  } catch {
    throw new NotionSyncError('invalid_database_url');
  }
}
export function assertTarget(url: string, expected: string | undefined) {
  const actual = databaseTarget(url);
  if (!expected || actual.target !== expected)
    throw new NotionSyncError('database_target_mismatch');
  return actual;
}
