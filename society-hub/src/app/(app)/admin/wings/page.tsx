import Wings from '@/components/screens/Wings';
import { gate } from '@/lib/server-auth';

export default async function Page() {
  const stop = await gate(['admin']);
  if (stop) return stop;
  return <Wings />;
}
