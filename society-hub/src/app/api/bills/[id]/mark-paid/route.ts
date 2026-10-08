import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { loadBill } from '@/lib/bills';

export const POST = route({ roles: ['admin'] }, async ({ user, params, body }) => {
  const b = await body(z.object({ method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER']), ref: z.string().trim().max(60).optional() }));
  const bill = await loadBill(user, params.id);
  const { count } = await db.bill.updateMany({ where: { id: bill.id, status: 'UNPAID' }, data: { status: 'PAID', paidAt: new Date(), method: b.method, paymentRef: b.ref || null } });
  if (!count) throw new ApiError(409, 'This bill is already paid', 'ALREADY_HANDLED');
  await audit(user, 'bill.marked_paid', bill.id, { flat: bill.flat.label, period: bill.period, method: b.method });
  return { ok: true };
});
