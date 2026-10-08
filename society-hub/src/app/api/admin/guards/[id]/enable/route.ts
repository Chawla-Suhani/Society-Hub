import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { idParam, pin } from '@/lib/validators';

export const POST = route({ roles: ['admin'] }, async ({ user, params, body }) => {
  const g = await db.user.findFirst({ where: { id: idParam(params.id), societyId: user.societyId, role: 'guard' } });
  if (!g) throw new ApiError(404, 'Guard not found', 'NOT_FOUND');
  await db.user.update({ where: { id: g.id }, data: { status: 'ACTIVE', failedAttempts: 0, lockedUntil: null } });
  await audit(user, 'guard.enabled', g.id, { name: g.fullName });
  return { ok: true };
});
