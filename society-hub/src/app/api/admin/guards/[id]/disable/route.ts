import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { idParam, pin } from '@/lib/validators';

export const POST = route({ roles: ['admin'], stepUp: true }, async ({ user, params, body }) => {
  const g = await db.user.findFirst({ where: { id: idParam(params.id), societyId: user.societyId, role: 'guard' } });
  if (!g) throw new ApiError(404, 'Guard not found', 'NOT_FOUND');
  // Lost phone? Disable the guard: their sessions end right away.
  await db.$transaction([
    db.user.update({ where: { id: g.id }, data: { status: 'SUSPENDED' } }),
    db.session.updateMany({ where: { userId: g.id }, data: { revoked: true } }),
  ]);
  await audit(user, 'guard.disabled', g.id, { name: g.fullName });
  return { ok: true };
});
