import Visitors from '@/components/screens/Visitors';
import { gate } from '@/lib/server-auth';

export default async function Page() {
  const stop = await gate(['resident']);
  if (stop) return stop;
  return <Visitors />;
}
