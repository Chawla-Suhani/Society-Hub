import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getAuth } from '@/lib/server-auth';
import { landingFor } from '@/lib/routes';
import SessionRecover from '@/components/SessionRecover';

// Login and sign-up pages: anyone already signed in is sent on to where they belong.
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const a = await getAuth();
  if (a.kind === 'expired') return <SessionRecover />;
  if (a.kind === 'user') redirect(landingFor(a.me));
  return <>{children}</>;
}
