import { redirect } from 'next/navigation';
import Pending from '@/components/screens/Pending';
import SessionRecover from '@/components/SessionRecover';
import { getAuth } from '@/lib/server-auth';
import { landingFor } from '@/lib/routes';

export default async function Page() {
  const a = await getAuth();
  if (a.kind === 'expired') return <SessionRecover />;
  if (a.kind === 'none') redirect('/login');
  if (a.me.role !== 'resident' || a.me.status === 'ACTIVE') redirect(landingFor(a.me));
  return <Pending />;
}
