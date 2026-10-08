import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { idParam } from '@/lib/validators';

// A walk-in visitor is waiting at the gate: the resident says yes or no.
export const POST = route({ roles: ['resident'] }, async ({ user, params, body }) => {
  const { approve } = await body(z.object({ approve: z.boolean() }));
  const p = await db.visitorPass.findFirst({ where: { id: idParam(params.id), societyId: user.societyId, flatId: user.flatId ?? -1 } });
  if (!p) throw new ApiError(404, 'Pass not found', 'NOT_FOUND');
  const { count } = await db.visitorPass.updateMany({
    where: { id: p.id, status: 'AWAITING_APPROVAL' },
    data: approve ? { status: 'APPROVED', expiresAt: new Date(Date.now() + 2 * 3600 * 1000) } : { status: 'REJECTED' },
  });
  if (!count) throw new ApiError(409, 'This request was already answered', 'ALREADY_HANDLED');
  return { ok: true };
});
