'use client';
import { useEffect, useRef, useState } from 'react';
import type { ActivityCursor, ActivityFilters, ActivityPage } from '@personal-desk/core';

export function useActivityFeed(initialPage: ActivityPage, now: string, projectId?: string) {
  const [page, setPage] = useState(initialPage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lastRequest = useRef<{ query: ActivityFilters; cursor: ActivityCursor | null }>({
    query: {},
    cursor: null,
  });
  useEffect(() => () => controller.current?.abort(), []);
  async function load(query: ActivityFilters, cursor: ActivityCursor | null = null) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    lastRequest.current = { query, cursor };
    setPending(true);
    setError(false);
    const params = new URLSearchParams({ now });
    for (const [key, value] of Object.entries({
      ...query,
      projectId: projectId ?? query.projectId,
    }))
      if (value) params.set(key, value);
    if (cursor) params.set('cursor', JSON.stringify(cursor));
    try {
      const response = await fetch(`/api/activity?${params}`, {
        signal: request.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Activity request failed');
      const result: ActivityPage = await response.json();
      if (request.signal.aborted) return;
      setPage((previous) => ({
        ...result,
        items: cursor
          ? [
              ...previous.items,
              ...result.items.filter((a) => !previous.items.some((p) => p.id === a.id)),
            ]
          : result.items,
      }));
    } catch {
      if (!request.signal.aborted) setError(true);
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }
  return {
    page,
    pending,
    error,
    load,
    retry: () => load(lastRequest.current.query, lastRequest.current.cursor),
  };
}
