import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Me, Role } from '@/types/api';
import { ApiError } from './errors';
import { authenticateToken, buildMe } from './session';
import SessionRecover from '@/components/SessionRecover';
import { homeFor, mustGoTo } from './routes';

export type AuthState = { kind: 'user'; me: Me } | { kind: 'expired' } | { kind: 'none' };

// Used by server components (layouts and pages) to know who is signed in, straight from the cookie + database.
export async function getAuth(): Promise<AuthState> {
  const token = (await cookies()).get('at')?.value;
  if (!token) return { kind: 'none' };
  try {
    const { user } = await authenticateToken(token);
    return { kind: 'user', me: await buildMe(user) };
  } catch (e) {
    if (e instanceof ApiError && e.code === 'TOKEN_EXPIRED') return { kind: 'expired' };
    return { kind: 'none' };
  }
}

/**
 * Put at the top of a protected page: `const stop = await gate(['admin']); if (stop) return stop;`
 * It redirects signed-out users, sends people to the step they still owe (2FA / approval),
 * sends other roles to their own home, and renders a silent token refresh when the 15-minute token ran out.
 * The API enforces the same rules again, so this only decides which screen to show.
 */
export async function gate(roles?: Role[]): Promise<ReactNode | null> {
  const a = await getAuth();
  if (a.kind === 'expired') return <SessionRecover />;
  if (a.kind === 'none') redirect('/login');
  const todo = mustGoTo(a.me);
  if (todo) redirect(todo);
  if (roles && !roles.includes(a.me.role)) redirect(homeFor(a.me));
  return null;
}
