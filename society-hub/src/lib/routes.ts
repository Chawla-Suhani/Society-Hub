import type { Me } from '@/types/api';

// Pure helpers shared by server components and client screens.
export const homeFor = (me: Me): string => (me.role === 'admin' ? '/admin' : me.role === 'guard' ? '/gate' : '/visitors');

// Where a signed-in user must go before they can use the app (or null if they can).
export function mustGoTo(me: Me): string | null {
  if (me.role === 'admin' && me.mfaSetupRequired) return '/setup-2fa';
  if (me.role === 'resident' && me.status !== 'ACTIVE') return '/pending';
  return null;
}

export const landingFor = (me: Me): string => mustGoTo(me) ?? homeFor(me);
