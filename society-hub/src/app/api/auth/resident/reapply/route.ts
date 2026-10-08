import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { buildMe } from '@/lib/session';
import { id, residentType } from '@/lib/validators';

// A rejected resident can fix their details and apply again.
export const POST = route({ access: 'user' }, async ({ user, body }) => {
  if (user.role !== 'resident' || user.status !== 'REJECTED') throw new ApiError(400, 'Nothing to re-apply for', 'VALIDATION');
  const b = await body(z.object({ flatId: id, residentType, proofNote: z.string().trim().max(300).optional() }));
  const flat = await db.flat.findFirst({ where: { id: b.flatId, societyId: user.societyId } });
  if (!flat) throw new ApiError(400, 'Please pick a flat from your society', 'VALIDATION');
  const updated = await db.user.update({
    where: { id: user.id },
    data: { flatId: flat.id, residentType: b.residentType, proofNote: b.proofNote, status: 'PENDING', rejectReason: null },
  });
  return { user: await buildMe(updated) };
});
