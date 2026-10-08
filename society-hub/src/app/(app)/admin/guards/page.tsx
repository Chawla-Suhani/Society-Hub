import Guards from '@/components/screens/Guards';
import { gate } from '@/lib/server-auth';

export default async function Page() {
  const stop = await gate(['admin']);
  if (stop) return stop;
  return <Guards />;
}
