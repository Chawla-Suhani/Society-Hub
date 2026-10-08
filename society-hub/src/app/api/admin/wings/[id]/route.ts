import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { idParam } from '@/lib/validators';

// Deleting a wing is destructive, so it needs a fresh 2FA check and an empty wing.
export const DELETE = route({ roles: ['admin'], stepUp: true }, async ({ user, params }) => {
  const wing = await db.wing.findFirst({ where: { id: idParam(params.id), societyId: user.societyId }, include: { flats: { select: { id: true } } } });
  if (!wing) throw new ApiError(404, 'Wing not found', 'NOT_FOUND');
  const flatIds = wing.flats.map((f) => f.id);
  const used =
    (await db.user.count({ where: { flatId: { in: flatIds } } })) +
    (await db.bill.count({ where: { flatId: { in: flatIds } } })) +
    (await db.visitorPass.count({ where: { flatId: { in: flatIds } } }));
  if (used) throw new ApiError(409, 'This wing has residents, bills or visitor history, so it cannot be deleted', 'IN_USE');
  await db.$transaction([
    db.notice.updateMany({ where: { wingId: wing.id }, data: { wingId: null } }),
    db.flat.deleteMany({ where: { wingId: wing.id } }),
    db.wing.delete({ where: { id: wing.id } }),
  ]);
  await audit(user, 'wing.deleted', wing.name);
  return { ok: true };
});
