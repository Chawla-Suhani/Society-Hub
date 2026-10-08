import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { idParam } from '@/lib/validators';

export const POST = route({ roles: ['admin'], stepUp: true }, async ({ user, params }) => {
  // Other societies' users look like "not found", so one admin can never touch another society.
  const r = await db.user.findFirst({ where: { id: idParam(params.id), societyId: user.societyId, role: 'resident' } });
  if (!r) throw new ApiError(404, 'Resident not found', 'NOT_FOUND');
  await db.$transaction([
    db.user.update({ where: { id: r.id }, data: { status: 'SUSPENDED', reviewedBy: user.id, reviewedAt: new Date() } }),
    db.session.updateMany({ where: { userId: r.id }, data: { revoked: true } }), // kicked out immediately
  ]);
  await audit(user, 'resident.suspended', r.id, { name: r.fullName });
  return { ok: true };
});
