import { redirect } from 'next/navigation';
import SetupMfa from '@/components/screens/SetupMfa';
import SessionRecover from '@/components/SessionRecover';
import { getAuth } from '@/lib/server-auth';
import { landingFor } from '@/lib/routes';

export default async function Page() {
  const a = await getAuth();
  if (a.kind === 'expired') return <SessionRecover />;
  if (a.kind === 'none') redirect('/login');
  if (!a.me.mfaSetupRequired) redirect(landingFor(a.me)); // already done, or not an admin
  return <SetupMfa />;
}
