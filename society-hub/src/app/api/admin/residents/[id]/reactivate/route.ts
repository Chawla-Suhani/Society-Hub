import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { idParam } from '@/lib/validators';

export const POST = route({ roles: ['admin'] }, async ({ user, params }) => {
  // Other societies' users look like "not found", so one admin can never touch another society.
  const r = await db.user.findFirst({ where: { id: idParam(params.id), societyId: user.societyId, role: 'resident' } });
  if (!r) throw new ApiError(404, 'Resident not found', 'NOT_FOUND');
  if (r.status !== 'SUSPENDED') throw new ApiError(409, 'Only suspended residents can be reactivated', 'VALIDATION');
  await db.user.update({ where: { id: r.id }, data: { status: 'ACTIVE', reviewedBy: user.id, reviewedAt: new Date() } });
  await audit(user, 'resident.reactivated', r.id, { name: r.fullName });
  return { ok: true };
});
