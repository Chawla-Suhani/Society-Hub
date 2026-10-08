import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { idParam } from '@/lib/validators';

export const POST = route({ roles: ['resident'] }, async ({ user, params }) => {
  const p = await db.visitorPass.findFirst({ where: { id: idParam(params.id), societyId: user.societyId, flatId: user.flatId ?? -1 } });
  if (!p) throw new ApiError(404, 'Pass not found', 'NOT_FOUND');
  const { count } = await db.visitorPass.updateMany({ where: { id: p.id, status: 'APPROVED' }, data: { status: 'CANCELLED' } });
  if (!count) throw new ApiError(409, 'Only unused passes can be cancelled', 'VALIDATION');
  return { ok: true };
});
