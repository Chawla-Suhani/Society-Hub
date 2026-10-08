import Overview from '@/components/screens/Overview';
import { gate } from '@/lib/server-auth';

export default async function Page() {
  const stop = await gate(['admin']);
  if (stop) return stop;
  return <Overview />;
}
