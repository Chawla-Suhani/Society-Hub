import Notices from '@/components/screens/Notices';
import { gate } from '@/lib/server-auth';

export default async function Page() {
  const stop = await gate(['admin', 'resident', 'guard']);
  if (stop) return stop;
  return <Notices />;
}
