import { db } from '@/lib/db';
import { route } from '@/lib/http';
import { billInclude } from '@/lib/bills';
import type { Defaulter } from '@/types/api';

// Flats with overdue bills, worst first.
export const GET = route({ roles: ['admin'] }, async ({ user }) => {
  const overdue = await db.bill.findMany({ where: { societyId: user.societyId, status: 'UNPAID', dueDate: { lt: new Date() } }, include: billInclude });
  const byFlat = new Map<number, Defaulter>();
  for (const b of overdue) {
    const row = byFlat.get(b.flatId) ?? { flatId: b.flatId, flat: b.flat.label, wing: b.flat.wing.name, months: 0, amount: 0, oldestDue: b.dueDate.toISOString() };
    row.months += 1;
    row.amount += b.amount;
    if (b.dueDate.toISOString() < row.oldestDue) row.oldestDue = b.dueDate.toISOString();
    byFlat.set(b.flatId, row);
  }
  return { defaulters: [...byFlat.values()].sort((a, b) => b.amount - a.amount) };
});
