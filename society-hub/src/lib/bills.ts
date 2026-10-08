import type { User } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './errors';
import { idParam } from './validators';

export const billInclude = { flat: { include: { wing: true } } } as const;

export async function loadBill(user: User, idStr: string | undefined) {
  const b = await db.bill.findFirst({
    where: { id: idParam(idStr), societyId: user.societyId, ...(user.role === 'resident' && { flatId: user.flatId ?? -1 }) },
    include: billInclude,
  });
  if (!b) throw new ApiError(404, 'Bill not found', 'NOT_FOUND');
  return b;
}
