import type { ProjectStatus, Task } from '@personal-desk/core';

export const sourceKinds = ['areas', 'projects', 'tasks'] as const;
export type SourceKind = (typeof sourceKinds)[number];
export type SourceIds = Record<SourceKind, string>;
export type PropertyType =
  'title' | 'rich_text' | 'status' | 'select' | 'multi_select' | 'relation' | 'date' | 'url';
export interface PropertyMapping {
  property: string;
  type: PropertyType;
}
export interface Mapping {
  areas: { name: PropertyMapping };
  projects: {
    name: PropertyMapping;
    status: PropertyMapping;
    area: PropertyMapping;
    description: PropertyMapping | null;
    deadline: PropertyMapping | null;
    github: PropertyMapping | null;
  };
  tasks: {
    title: PropertyMapping;
    status: PropertyMapping;
    project: PropertyMapping;
    due: PropertyMapping | null;
    priority: PropertyMapping | null;
    type: PropertyMapping | null;
  };
  projectStatuses: Record<string, ProjectStatus>;
  taskStatuses: Record<string, Task['status']>;
  taskPriorities: Record<string, NonNullable<Task['priority']>>;
}
export interface ResolvedProperty extends PropertyMapping {
  id: string;
  name: string;
}
export type ResolvedMapping = {
  [K in SourceKind]: Record<keyof Mapping[K], ResolvedProperty | null>;
};
export interface Issue {
  code: string;
  source?: SourceKind;
  externalId?: string;
  field?: string;
}
export class NotionSyncError extends Error {
  constructor(
    readonly code: string,
    readonly retryNotBefore?: string,
  ) {
    super(code);
    this.name = 'NotionSyncError';
  }
}
export interface SourceEntity {
  externalId: string;
  sourceUpdatedAt: string;
}
export interface NormalizedArea extends SourceEntity {
  name: string;
}
export interface NormalizedDate {
  at: string;
  allDay: boolean;
}
export interface NormalizedProject extends SourceEntity {
  name: string;
  description: string | null;
  status: ProjectStatus;
  areaExternalId: string | null;
  sourceCreatedAt: string;
  deadline: NormalizedDate | null;
  github: { url: string; name: string } | null;
  // null mapping means do not manage that field; null value means explicitly empty.
  managesDeadline: boolean;
  managesGithub: boolean;
  managesDescription: boolean;
}
export interface NormalizedTask extends SourceEntity {
  title: string;
  status: Task['status'];
  projectExternalId: string | null;
  due: NormalizedDate | null;
  priority: Task['priority'];
  sourceType: string[];
  managesDue: boolean;
  managesPriority: boolean;
}
export interface NormalizedBatch {
  areas: NormalizedArea[];
  projects: NormalizedProject[];
  tasks: NormalizedTask[];
  fetched: Record<SourceKind, number>;
  issues: Issue[];
  tombstones?: (SourceEntity & { source: SourceKind })[];
}
export type SyncMode = 'full' | 'incremental';
export interface CollectionRequest {
  mode: SyncMode;
  since?: string;
}
export type JsonObject = Record<string, unknown>;
export function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NotionSyncError('invalid_response');
  return value as JsonObject;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new NotionSyncError('invalid_response');
  return value;
}
export function string(value: unknown): string {
  if (typeof value !== 'string') throw new NotionSyncError('invalid_response');
  return value;
}
export function notionId(value: unknown): string {
  const compact = string(value).replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new NotionSyncError('invalid_notion_id');
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}
export function safeIssue(error: unknown): string {
  if (error instanceof NotionSyncError) return error.code;
  if (error instanceof Error && ['notion_sync_busy', 'notion_lock_lost'].includes(error.message))
    return error.message;
  return 'operation_failed';
}

/** Last line of defense for CLI output, including observed schema labels. */
export function redact(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length))
    result = result.split(secret).join('[REDACTED]');
  return result
    .replace(/\b(?:ntn_|secret_)[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s"<>]+/gi, '[REDACTED_DATABASE_URL]');
}
