export type DataSourceMode = 'mock' | 'database';
export function dataSourceMode(
  value: string | undefined,
  environment = process.env.NODE_ENV,
): DataSourceMode {
  if (value === undefined) {
    if (environment === 'production')
      throw new Error('DATA_SOURCE must be explicitly set to mock or database in production');
    return 'mock';
  }
  if (value === 'mock') return 'mock';
  if (value === 'database') return 'database';
  throw new Error('DATA_SOURCE must be mock or database');
}
export function databaseUrl(value: string | undefined): string {
  if (!value) throw new Error('DATABASE_URL is required for DATA_SOURCE=database');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid DATABASE_URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol))
    throw new Error('Invalid DATABASE_URL protocol');
  return value;
}
