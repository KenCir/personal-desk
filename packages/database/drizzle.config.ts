import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
config({ path: '../../.env' });
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://personal_desk:personal_desk@localhost:5432/personal_desk',
  },
});
