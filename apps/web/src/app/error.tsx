'use client';
import { ErrorState } from '@/components/shared';
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState retry={reset} />;
}
