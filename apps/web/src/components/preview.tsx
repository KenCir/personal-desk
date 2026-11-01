'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { createContext, useContext, type ReactNode } from 'react';
import type { SectionState } from '@personal-desk/core';
import { t } from '@personal-desk/i18n';
import { SectionContent } from './shared';

export type PreviewMode = 'ready' | 'loading' | 'empty' | 'error' | 'cached' | 'stale';
const PreviewContext = createContext({ mode: 'ready' as PreviewMode, section: '' });
export function PreviewProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const raw = params.get('state');
  const mode = ['loading', 'empty', 'error', 'cached', 'stale'].includes(raw ?? '')
    ? (raw as PreviewMode)
    : 'ready';
  return (
    <PreviewContext.Provider value={{ mode, section: params.get('section') ?? '' }}>
      {children}
    </PreviewContext.Provider>
  );
}
export function DataSection({
  name,
  empty,
  emptyMessage,
  now,
  children,
}: {
  name: string;
  empty: boolean;
  emptyMessage?: string;
  now: string;
  children: ReactNode;
}) {
  const { mode, section } = useContext(PreviewContext);
  const router = useRouter();
  const params = useSearchParams();
  const applied = !section || section === name ? mode : 'ready';
  const state: SectionState = {
    loading: applied === 'loading',
    error: ['error', 'cached'].includes(applied),
    stale: ['cached', 'stale'].includes(applied),
    lastSuccessAt: new Date(Date.parse(now) - 8 * 60_000).toISOString(),
  };
  const retry = () => {
    const next = new URLSearchParams(params.toString());
    next.delete('state');
    next.delete('section');
    router.replace(`?${next}`);
    router.refresh();
  };
  return (
    <SectionContent
      state={state}
      empty={empty || ['loading', 'empty', 'error'].includes(applied)}
      emptyMessage={emptyMessage}
      errorMessage={
        name === 'projects'
          ? t('projects.error')
          : name === 'activity'
            ? t('activity.error')
            : ['infrastructure', 'overall', 'systems', 'services', 'backups', 'alerts'].includes(
                  name,
                )
              ? t('infrastructure.error')
              : undefined
      }
      retry={retry}
    >
      {children}
    </SectionContent>
  );
}
