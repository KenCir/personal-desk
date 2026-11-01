import { getReadContext } from '@/lib/data';
import { InvalidActivityRequest, parseActivityRequest } from '@/lib/activity-request';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { now, query } = parseActivityRequest(new URL(request.url).searchParams);
    const { source, mode } = getReadContext(now);
    if (mode === 'database' && query.cursor && !/^[0-9a-f-]{36}$/i.test(query.cursor.id))
      throw new InvalidActivityRequest();
    return Response.json(await source.getActivities(query), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    // Never serialize SQL, connection details, or provider payloads to the browser.
    return Response.json(
      { error: error instanceof InvalidActivityRequest ? 'invalid_query' : 'read_failed' },
      {
        status: error instanceof InvalidActivityRequest ? 400 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
