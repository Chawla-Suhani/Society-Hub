import Gate from '@/components/screens/Gate';
import { gate } from '@/lib/server-auth';

export default async function Page() {
  const stop = await gate(['guard']);
  if (stop) return stop;
  return <Gate />;
}
