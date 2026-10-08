import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/server-auth';
import { landingFor } from '@/lib/routes';
import SessionRecover from '@/components/SessionRecover';

export default async function Home() {
  const a = await getAuth();
  if (a.kind === 'expired') return <SessionRecover />;
  redirect(a.kind === 'user' ? landingFor(a.me) : '/login');
}
