import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
// Explicit construction keeps imports safe when the mock application has no database.
export function createDatabase(url: string) {
  const client = postgres(url, { max: 5, connect_timeout: 5, idle_timeout: 20 });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}
