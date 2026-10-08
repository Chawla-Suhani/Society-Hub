import { z } from '@/lib/errors';
import { route } from '@/lib/http';
import { REASONS, findPass } from '@/lib/passes';

export const POST = route({ roles: ['guard'] }, async ({ user, body }) => {
  const pass = await findPass(user.societyId, await body(z.any()));
  return { pass, canCheckIn: pass.status === 'APPROVED', reason: REASONS[pass.status] ?? null };
});
