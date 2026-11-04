import type { NextConfig } from 'next';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
// The workspace root .env is shared with Drizzle; shell variables take precedence.
loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
const config: NextConfig = {
  // Keep the existing pnpm build/start workflow; containers opt into the standalone artifact.
  output: process.env.DESK_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  transpilePackages: ['@personal-desk/core', '@personal-desk/i18n', '@personal-desk/database'],
};
export default config;
