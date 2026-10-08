import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { billDto } from '@/lib/dto';
import { randomCode } from '@/lib/crypto';
import { loadBill } from '@/lib/bills';

// Test-mode payment. To go live, swap this body for Razorpay order creation + webhook verification.
export const POST = route({ roles: ['resident'] }, async ({ user, params }) => {
  const b = await loadBill(user, params.id);
  // The status check is inside the UPDATE, so a double click cannot pay twice.
  const { count } = await db.bill.updateMany({ where: { id: b.id, status: 'UNPAID' }, data: { status: 'PAID', paidAt: new Date(), method: 'ONLINE_TEST', paymentRef: `TEST-${randomCode(10)}` } });
  if (!count) throw new ApiError(409, 'This bill is already paid', 'ALREADY_HANDLED');
  return { bill: billDto(await loadBill(user, params.id)) };
});
