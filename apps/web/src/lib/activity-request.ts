import { categories, importances, type ActivityQuery } from '@personal-desk/core';
export class InvalidActivityRequest extends Error {}
const invalid = () => {
  throw new InvalidActivityRequest('Invalid activity query');
};
const timestamp = (value: string) =>
  value.length <= 64 &&
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/.test(value) &&
  Number.isFinite(Date.parse(value));
export function parseActivityRequest(params: URLSearchParams): {
  now: string;
  query: ActivityQuery;
} {
  const now = params.get('now') ?? new Date().toISOString();
  if (!timestamp(now)) invalid();
  const search = params.get('search') ?? '';
  const category = params.get('category') ?? '';
  const importance = params.get('importance') ?? '';
  const projectId = params.get('projectId') ?? '';
  if (
    search.length > 500 ||
    projectId.length > 100 ||
    (category && !categories.includes(category as (typeof categories)[number])) ||
    (importance && !importances.includes(importance as (typeof importances)[number]))
  )
    invalid();
  const query: ActivityQuery = {
    search,
    category: category as ActivityQuery['category'],
    importance: importance as ActivityQuery['importance'],
    projectId,
    until: now,
    limit: 30,
  };
  const raw = params.get('cursor');
  if (raw) {
    if (raw.length > 300) invalid();
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      invalid();
    }
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      !('occurredAt' in value) ||
      typeof value.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(value.id) ||
      typeof value.occurredAt !== 'string' ||
      !timestamp(value.occurredAt)
    )
      invalid();
    query.cursor = value as NonNullable<ActivityQuery['cursor']>;
  }
  return { now, query };
}
