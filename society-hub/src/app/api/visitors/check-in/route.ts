import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { passDto } from '@/lib/dto';
import { REASONS, findPass, passInclude } from '@/lib/passes';

export const POST = route({ roles: ['guard'] }, async ({ user, body }) => {
  const p = await findPass(user.societyId, await body(z.any()));
  if (p.status !== 'APPROVED') throw new ApiError(409, REASONS[p.status] ?? 'Pass cannot be used', 'PASS_INVALID');
  // One-time use even if two guards scan at the same instant: the status check is part of the UPDATE.
  const { count } = await db.visitorPass.updateMany({
    where: { id: p.id, status: 'APPROVED', expiresAt: { gt: new Date() } },
    data: { status: 'CHECKED_IN', checkedInAt: new Date(), checkedInBy: user.id },
  });
  if (!count) throw new ApiError(409, REASONS.CHECKED_IN, 'PASS_INVALID');
  return { pass: passDto(await db.visitorPass.findUniqueOrThrow({ where: { id: p.id }, include: passInclude })) };
});
