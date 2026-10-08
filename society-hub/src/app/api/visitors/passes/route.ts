import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { json, route } from '@/lib/http';
import { passDto } from '@/lib/dto';
import { passInclude, uniquePassCode } from '@/lib/passes';
import { phone } from '@/lib/validators';

// Resident creates an invite pass (QR). It works once and expires.
export const POST = route({ roles: ['resident'] }, async ({ user, body }) => {
  const b = await body(
    z.object({
      visitorName: z.string().trim().min(2).max(80),
      visitorPhone: phone.optional().or(z.literal('').transform(() => undefined)),
      purpose: z.string().trim().max(80).optional(),
      validHours: z.coerce.number().int().min(1).max(72).default(12),
    }),
  );
  if (!user.flatId) throw new ApiError(400, 'No flat linked to your account', 'VALIDATION');
  const pass = await db.visitorPass.create({
    data: {
      societyId: user.societyId, flatId: user.flatId, createdById: user.id, visitorName: b.visitorName, visitorPhone: b.visitorPhone,
      purpose: b.purpose, code: await uniquePassCode(), source: 'invite', status: 'APPROVED',
      expiresAt: new Date(Date.now() + b.validHours * 3600 * 1000),
    },
    include: passInclude,
  });
  return json({ pass: passDto(pass) }, 201);
});
