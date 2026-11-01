import { LoadingSkeleton } from '@/components/shared';
export default function Loading() {
  return (
    <div className="page-stack">
      <LoadingSkeleton />
      <LoadingSkeleton />
      <LoadingSkeleton />
    </div>
  );
}
