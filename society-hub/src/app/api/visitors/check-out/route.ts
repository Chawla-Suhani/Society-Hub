import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { findPass } from '@/lib/passes';

export const POST = route({ roles: ['guard'] }, async ({ user, body }) => {
  const p = await findPass(user.societyId, await body(z.any()));
  const { count } = await db.visitorPass.updateMany({ where: { id: p.id, status: 'CHECKED_IN' }, data: { status: 'CHECKED_OUT', checkedOutAt: new Date() } });
  if (!count) throw new ApiError(409, 'This visitor is not marked as inside', 'VALIDATION');
  return { ok: true };
});
