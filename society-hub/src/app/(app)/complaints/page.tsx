import Complaints from '@/components/screens/Complaints';
import { gate } from '@/lib/server-auth';

export default async function Page() {
  const stop = await gate(['admin', 'resident']);
  if (stop) return stop;
  return <Complaints />;
}
