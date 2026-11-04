import { readFileSync } from 'node:fs';

export function readSecret(env, key, read = readFileSync) {
  if (env[key] !== undefined || !env[`${key}_FILE`])
    throw new Error('secret_configuration_invalid');
  let value;
  try {
    value = read(env[`${key}_FILE`], 'utf8').replace(/\r?\n$/, '');
  } catch {
    throw new Error('secret_unreadable');
  }
  if (!value || /[\r\n\0]/.test(value)) throw new Error('secret_invalid');
  return value;
}

export function validateDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== 'postgres' ||
      (url.port && url.port !== '5432') ||
      url.pathname !== '/personal_desk' ||
      !url.username ||
      !url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url;
  } catch {
    throw new Error('production_database_target_invalid');
  }
}

export function loadProductionSecrets(env, read) {
  const role = env.DESK_CONTAINER_ROLE;
  if (!['web', 'worker', 'maintenance'].includes(role)) throw new Error('container_role_invalid');
  const database = readSecret(env, 'DATABASE_URL', read);
  const url = validateDatabaseUrl(database);
  const expected = { web: 'desk_web', worker: 'desk_worker', maintenance: 'personal_desk' }[role];
  if (url.username !== expected) throw new Error('production_database_role_invalid');
  if (role === 'web' && env.DATA_SOURCE !== 'database')
    throw new Error('production_data_source_invalid');
  if (role === 'worker' && env.NOTION_SYNC_TARGET !== 'postgres:5432/personal_desk')
    throw new Error('production_sync_target_invalid');
  const token = role === 'worker' ? readSecret(env, 'NOTION_TOKEN', read) : undefined;
  env.DATABASE_URL = database;
  if (token) env.NOTION_TOKEN = token;
}
