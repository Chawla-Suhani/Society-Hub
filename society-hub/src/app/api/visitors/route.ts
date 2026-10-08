import { db } from '@/lib/db';
import { z } from '@/lib/errors';
import { route } from '@/lib/http';
import { passDto } from '@/lib/dto';
import { passInclude } from '@/lib/passes';

// scope: inside | expected | awaiting | recent
export const GET = route({ roles: ['admin', 'resident', 'guard'] }, async ({ user, query }) => {
  const { scope } = query(z.object({ scope: z.enum(['inside', 'expected', 'awaiting', 'recent']).default('recent') }));
  const rows = await db.visitorPass.findMany({
    where: {
      societyId: user.societyId,
      ...(user.role === 'resident' && { flatId: user.flatId ?? -1 }),
      ...(scope === 'inside' && { status: 'CHECKED_IN' as const }),
      ...(scope === 'expected' && { status: 'APPROVED' as const }),
      ...(scope === 'awaiting' && { status: 'AWAITING_APPROVAL' as const }),
    },
    include: passInclude,
    orderBy: { id: 'desc' },
    take: 100,
  });
  let passes = rows.map(passDto);
  if (scope === 'expected') passes = passes.filter((p) => p.status === 'APPROVED');
  return { passes };
});
