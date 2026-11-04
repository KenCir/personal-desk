import { getWebDatabase } from '@/lib/data-sources/database';
export const dynamic = 'force-dynamic';
export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (process.env.DATA_SOURCE !== 'database') throw new Error('database_required');
    await Promise.race([
      getWebDatabase().ready(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 3000);
      }),
    ]);
    return Response.json({ status: 'ready' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timer);
  }
}
