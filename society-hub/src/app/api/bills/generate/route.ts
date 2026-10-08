import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { json, route } from '@/lib/http';
import { audit } from '@/lib/audit';

// Generate a month's maintenance bills. Flats that already have one are skipped, so running it twice is safe.
export const POST = route({ roles: ['admin'] }, async ({ user, body }) => {
  const b = await body(
    z.object({
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
      amount: z.coerce.number().int().min(100).max(200000),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
      wingId: z.coerce.number().int().positive().optional().nullable(),
    }),
  );
  const flats = await db.flat.findMany({ where: { societyId: user.societyId, ...(b.wingId && { wingId: b.wingId }) }, select: { id: true } });
  if (!flats.length) throw new ApiError(400, 'Add a wing with flats first', 'VALIDATION');

  const existing = new Set((await db.bill.findMany({ where: { societyId: user.societyId, period: b.period }, select: { flatId: true } })).map((x) => x.flatId));
  const dueDate = new Date(`${b.dueDate}T23:59:59+05:30`);
  const fresh = flats.filter((f) => !existing.has(f.id)).map((f) => ({ societyId: user.societyId, flatId: f.id, period: b.period, amount: b.amount, dueDate }));
  if (fresh.length) await db.bill.createMany({ data: fresh });
  await audit(user, 'bills.generated', b.period, { created: fresh.length, amount: b.amount });
  return json({ created: fresh.length, skipped: flats.length - fresh.length }, 201);
});
