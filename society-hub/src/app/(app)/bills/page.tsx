import Bills from '@/components/screens/Bills';
import { gate } from '@/lib/server-auth';

export default async function Page() {
  const stop = await gate(['admin', 'resident']);
  if (stop) return stop;
  return <Bills />;
}
