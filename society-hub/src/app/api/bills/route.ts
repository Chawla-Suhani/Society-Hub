import { db } from '@/lib/db';
import { z } from '@/lib/errors';
import { route } from '@/lib/http';
import { billDto } from '@/lib/dto';
import { billInclude } from '@/lib/bills';

export const GET = route({ roles: ['admin', 'resident'] }, async ({ user, query }) => {
  const f = query(z.object({ period: z.string().optional(), status: z.enum(['UNPAID', 'PAID']).optional(), wingId: z.coerce.number().optional() }));
  const rows = await db.bill.findMany({
    where: {
      societyId: user.societyId,
      ...(user.role === 'resident' && { flatId: user.flatId ?? -1 }),
      ...(f.period && { period: f.period }),
      ...(f.status && { status: f.status }),
      ...(f.wingId && user.role === 'admin' && { flat: { wingId: f.wingId } }),
    },
    include: billInclude,
    orderBy: [{ period: 'desc' }, { flat: { label: 'asc' } }],
    take: 500,
  });
  const bills = rows.map(billDto);
  const sum = (arr: typeof bills): number => arr.reduce((t, b) => t + b.amount, 0);
  return {
    bills,
    totals: { billed: sum(bills), collected: sum(bills.filter((b) => b.status === 'PAID')), outstanding: sum(bills.filter((b) => b.status === 'UNPAID')) },
  };
});
