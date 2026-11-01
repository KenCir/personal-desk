import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { PreviewProvider } from '@/components/preview';
import { LoadingSkeleton } from '@/components/shared';
import './globals.css';
import { dataSourceMode } from '@/lib/data-sources/config';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'Personal Desk', template: '%s | Personal Desk' },
  description: '日々の活動とインフラを集約するパーソナルワークスペース',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <AppShell database={dataSourceMode(process.env.DATA_SOURCE) === 'database'}>
          <Suspense fallback={<LoadingSkeleton />}>
            <PreviewProvider>{children}</PreviewProvider>
          </Suspense>
        </AppShell>
      </body>
    </html>
  );
}
