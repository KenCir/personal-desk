// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { defaultMapping, parseMapping, assertTarget, sourceIds } from './config';
import { validateSchemas } from './collector';
import { githubRepository, normalizeBatch, normalizeDate } from './normalize';
import {
  fixtureCollection,
  fixturePages,
  fixtureSchemas,
  id,
  ids,
  prop,
  relation,
  status,
} from './fixtures';
import { object, redact } from './types';

describe('Notion mapping and normalization', () => {
  it('validates the observed schema and maps all configured project/task statuses exactly', () => {
    const { resolved, issues } = validateSchemas(fixtureSchemas(), defaultMapping, ids);
    expect(issues).toEqual([]);
    for (const [sourceStatus, expected] of Object.entries(defaultMapping.projectStatuses)) {
      const pages = fixturePages();
      object(pages.projects[0].properties).Status = status(sourceStatus);
      expect(normalizeBatch(pages, resolved, defaultMapping, ids).projects[0].status).toBe(
        expected,
      );
    }
    for (const [sourceStatus, expected] of Object.entries(defaultMapping.taskStatuses)) {
      const pages = fixturePages();
      object(pages.tasks[0].properties).Status = status(sourceStatus);
      expect(normalizeBatch(pages, resolved, defaultMapping, ids).tasks[0].status).toBe(expected);
    }
  });
  it('resolves properties by configured IDs and accepts type changes only via explicit configuration', () => {
    const schemas = fixtureSchemas();
    schemas[1].properties.find((p) => p.id === 'status')!.type = 'select';
    expect(validateSchemas(schemas, defaultMapping, ids).issues).toContainEqual({
      code: 'property_mapping_mismatch',
      source: 'projects',
      field: 'status',
    });
    const mapping = structuredClone(defaultMapping);
    mapping.projects.status = { property: 'status', type: 'select' };
    schemas[1].properties.find((p) => p.id === 'status')!.name = '進捗';
    expect(validateSchemas(schemas, mapping, ids).issues).toEqual([]);
    const pages = fixturePages();
    object(pages.projects[0].properties).Status = prop('status', 'select', { name: 'Active' });
    const { resolved } = validateSchemas(schemas, mapping, ids);
    expect(normalizeBatch(pages, resolved, mapping, ids).projects[0].status).toBe('active');
  });
  it('reports unsupported status options and skips unsupported entities without fallback', () => {
    const schemas = fixtureSchemas();
    schemas[1].properties.find((p) => p.id === 'status')!.options!.push('Surprise');
    expect(validateSchemas(schemas, defaultMapping, ids).issues[0].code).toBe(
      'unmapped_schema_option',
    );
    const pages = fixturePages();
    object(pages.projects[0].properties).Status = status('Surprise');
    const collection = fixtureCollection(pages);
    expect(collection.batch.projects).toEqual([]);
    expect(collection.batch.issues).toContainEqual({
      code: 'unsupported_status',
      source: 'projects',
      externalId: id(2),
    });
  });
  it('validates relation targets in both the schema and page values', () => {
    const schemas = fixtureSchemas();
    schemas[1].properties.find((p) => p.id === 'area')!.relationDataSourceId = id(999);
    expect(validateSchemas(schemas, defaultMapping, ids).issues[0].code).toBe(
      'relation_schema_mismatch',
    );
    const pages = fixturePages();
    object(pages.projects[0].properties).Area = relation('area', [id(1), id(8)]);
    expect(fixtureCollection(pages).batch.projects).toEqual([]);
    expect(fixtureCollection(pages).batch.issues[0].code).toBe('multiple_or_incomplete_relation');
    const valid = fixtureCollection().batch;
    expect(valid.projects[0].areaExternalId).toBe(id(1));
    expect(valid.tasks[0].projectExternalId).toBe(id(2));
  });
  it('allows empty relations, null priorities, and keeps Type out of the task priority', () => {
    const pages = fixturePages();
    object(pages.projects[0].properties).Area = relation('area', []);
    object(pages.tasks[0].properties).Project = relation('project', []);
    object(pages.tasks[0].properties).Priority = prop('priority', 'select', null);
    const batch = fixtureCollection(pages).batch;
    expect(batch.issues).toEqual([]);
    expect(batch.projects[0].areaExternalId).toBeNull();
    expect(batch.tasks[0]).toMatchObject({
      projectExternalId: null,
      priority: null,
      sourceType: ['Work'],
    });
  });
  it('rejects foreign-source pages, empty titles, incomplete relations and archived pages', () => {
    const pages = fixturePages();
    pages.areas[0].parent = { type: 'data_source_id', data_source_id: id(999) };
    object(pages.projects[0].properties).Area = { ...relation('area', []), has_more: true };
    object(pages.tasks[0].properties).Task = prop('title', 'title', []);
    pages.tasks[1].in_trash = true;
    const batch = fixtureCollection(pages).batch;
    expect(batch.areas).toEqual([]);
    expect(batch.projects).toEqual([]);
    expect(batch.tasks).toEqual([]);
    expect(batch.issues.map((issue) => issue.code)).toEqual([
      'unexpected_page_parent',
      'multiple_or_incomplete_relation',
      'empty_title',
      'archived_page_skipped',
    ]);
  });
  it('requires explicit valid mapping/configuration and exact target identity', () => {
    expect(parseMapping(defaultMapping)).toEqual(defaultMapping);
    expect(() => parseMapping({ ...defaultMapping, taskStatuses: { Todo: 'active' } })).toThrow();
    expect(() => sourceIds({})).toThrow('missing_areas');
    expect(() =>
      sourceIds({
        NOTION_AREAS_DATA_SOURCE_ID: ids.areas,
        NOTION_PROJECTS_DATA_SOURCE_ID: ids.areas,
        NOTION_TASKS_DATA_SOURCE_ID: ids.tasks,
      }),
    ).toThrow('duplicate');
    expect(assertTarget('postgres://user:secret@host:5433/desk', 'host:5433/desk').database).toBe(
      'desk',
    );
    expect(() => assertTarget('postgres://user:secret@host:5433/desk', 'other:5433/desk')).toThrow(
      'mismatch',
    );
    expect(() => assertTarget('postgres://user:secret@host:5433/desk', undefined)).toThrow(
      'mismatch',
    );
  });
});

describe('dates, URLs and secret safety', () => {
  it('treats date-only as a Tokyo calendar day including month/year boundaries', () => {
    expect(normalizeDate({ start: '2027-01-01', time_zone: null })).toEqual({
      at: '2026-12-31T15:00:00Z',
      allDay: true,
    });
    expect(normalizeDate({ start: '2026-10-30' })).toEqual({
      at: '2026-10-29T15:00:00Z',
      allDay: true,
    });
    expect(normalizeDate(null)).toBeNull();
    expect(() => normalizeDate({ start: '2026-02-30' })).toThrow('invalid_date');
  });
  it('preserves instants from offsets and explicit IANA time zones', () => {
    expect(normalizeDate({ start: '2026-10-30T09:30:00+09:00' })).toEqual({
      at: '2026-10-30T00:30:00Z',
      allDay: false,
    });
    expect(normalizeDate({ start: '2026-10-30T09:30:00-04:00' })).toEqual({
      at: '2026-10-30T13:30:00Z',
      allDay: false,
    });
    expect(normalizeDate({ start: '2026-10-30T09:30:00', time_zone: 'Asia/Tokyo' })).toEqual({
      at: '2026-10-30T00:30:00Z',
      allDay: false,
    });
    expect(() => normalizeDate({ start: '2026-10-30T09:30:00' })).toThrow('invalid_date');
    expect(() =>
      normalizeDate({ start: '2026-03-08T02:30:00', time_zone: 'America/New_York' }),
    ).toThrow('invalid_date');
  });
  it('normalizes only GitHub repository URLs', () => {
    expect(githubRepository('http://github.com/Owner/Repo.git/?tab=readme#top')).toEqual({
      url: 'https://github.com/owner/repo',
      name: 'repo',
    });
    expect(githubRepository(null)).toBeNull();
    for (const url of [
      'javascript:alert(1)',
      'https://github.com.evil.test/a/b',
      'https://user:secret@github.com/a/b',
      'https://github.com/a/b/issues',
      'https://gitlab.com/a/b',
      'https://github.com/a',
      'https://github.com/a/%2e%2e',
      'ssh://git@github.com/a/b',
    ])
      expect(() => githubRepository(url)).toThrow('invalid_github');
  });
  it('redacts configured secrets, token patterns and database URLs', () => {
    const output = redact(
      'custom-token ntn_abcdef secret_abcdef postgres://user:password@host/db',
      ['custom-token', 'password'],
    );
    expect(output).not.toMatch(/custom-token|ntn_|secret_|password|user:|host\/db/);
  });
});
