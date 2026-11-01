import { defaultMapping } from './config';
import { inspectSchema, validateSchemas } from './collector';
import { normalizeBatch } from './normalize';
import type { JsonObject, SourceIds, SourceKind } from './types';

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ids: SourceIds = { areas: id(100), projects: id(200), tasks: id(300) };
export const time = '2026-10-30T00:00:00Z';
export const later = '2026-10-30T01:00:00Z';
const richText = (value: string) => [{ type: 'text', plain_text: value, text: { content: value } }];
export const prop = (id: string, type: string, value: unknown) => ({ id, type, [type]: value });
export const title = (id: string, value: string) => prop(id, 'title', richText(value));
export const status = (value: string) => prop('status', 'status', { name: value });
export const relation = (id: string, values: string[]) => ({
  ...prop(
    id,
    'relation',
    values.map((id) => ({ id })),
  ),
  has_more: false,
});
export const date = (id: string, value: string | null) =>
  prop(id, 'date', value === null ? null : { start: value, end: null, time_zone: null });
export const page = (id: string, kind: SourceKind, properties: JsonObject): JsonObject => ({
  object: 'page',
  id,
  parent: { type: 'data_source_id', data_source_id: ids[kind] },
  created_time: '2026-10-01T00:00:00Z',
  last_edited_time: time,
  in_trash: false,
  properties,
});
export function fixtureSchemas() {
  const options = (values: string[]) => ({ options: values.map((name) => ({ name })) });
  const schemas = {
    areas: { Name: prop('name', 'title', {}) },
    projects: {
      Name: prop('name', 'title', {}),
      Status: prop('status', 'status', options(Object.keys(defaultMapping.projectStatuses))),
      Area: prop('area', 'relation', { data_source_id: ids.areas }),
      Deadline: prop('deadline', 'date', {}),
      GitHub: prop('github', 'url', {}),
    },
    tasks: {
      Task: prop('title', 'title', {}),
      Status: prop('status', 'status', options(Object.keys(defaultMapping.taskStatuses))),
      Project: prop('project', 'relation', { data_source_id: ids.projects }),
      Due: prop('due', 'date', {}),
      Priority: prop('priority', 'select', options(Object.keys(defaultMapping.taskPriorities))),
      Type: prop('type', 'select', options(['Work', 'Personal'])),
    },
  };
  return Object.entries(schemas).map(([source, properties]) =>
    inspectSchema(
      {
        object: 'data_source',
        id: ids[source as SourceKind],
        parent: { type: 'database_id', database_id: id(900) },
        properties,
      },
      source as SourceKind,
      ids[source as SourceKind],
    ),
  );
}
export function fixturePages(): Record<SourceKind, JsonObject[]> {
  return {
    areas: [page(id(1), 'areas', { Name: title('name', 'Development') })],
    projects: [
      page(id(2), 'projects', {
        Name: title('name', 'Personal Desk'),
        Status: status('Active'),
        Area: relation('area', [id(1)]),
        Deadline: date('deadline', '2026-11-01'),
        GitHub: prop('github', 'url', 'https://github.com/Example/Personal-Desk.git?tab=readme'),
      }),
    ],
    tasks: [
      page(id(3), 'tasks', {
        Task: title('title', 'Waiting task'),
        Status: status('Waiting'),
        Project: relation('project', [id(2)]),
        Due: date('due', '2026-10-29'),
        Priority: prop('priority', 'select', { name: 'Urgent' }),
        Type: prop('type', 'select', { name: 'Work' }),
      }),
      page(id(4), 'tasks', {
        Task: title('title', 'Active task'),
        Status: status('Doing'),
        Project: relation('project', [id(2)]),
        Due: date('due', '2026-10-30'),
        Priority: prop('priority', 'select', { name: 'High' }),
        Type: prop('type', 'select', null),
      }),
    ],
  };
}
export function fixtureCollection(pages = fixturePages()) {
  const schemas = fixtureSchemas();
  const { resolved } = validateSchemas(schemas, defaultMapping, ids);
  return { schemas, batch: normalizeBatch(pages, resolved, defaultMapping, ids), fatal: false };
}
