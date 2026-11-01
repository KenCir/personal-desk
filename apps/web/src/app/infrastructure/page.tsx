import { getReadContext } from '@/lib/data';
import { InfrastructureView } from '@/components/infrastructure/infrastructure-view';
export const dynamic = 'force-dynamic';
export default async function InfrastructurePage() {
  const { source, now } = getReadContext();
  const data = await source.getInfrastructure();
  return <InfrastructureView data={data} initialNow={now} />;
}
