import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { json, route } from '@/lib/http';
import { passDto } from '@/lib/dto';
import { passInclude, uniquePassCode } from '@/lib/passes';
import { id, phone } from '@/lib/validators';

// A visitor without a pass: the guard logs them and the resident approves or declines.
export const POST = route({ roles: ['guard'] }, async ({ user, body }) => {
  const b = await body(
    z.object({
      visitorName: z.string().trim().min(2).max(80),
      visitorPhone: phone.optional().or(z.literal('').transform(() => undefined)),
      purpose: z.string().trim().max(80).optional(),
      flatId: id,
    }),
  );
  const flat = await db.flat.findFirst({ where: { id: b.flatId, societyId: user.societyId } });
  if (!flat) throw new ApiError(400, 'Pick a flat from this society', 'VALIDATION');
  const pass = await db.visitorPass.create({
    data: {
      societyId: user.societyId, flatId: flat.id, createdById: user.id, visitorName: b.visitorName, visitorPhone: b.visitorPhone, purpose: b.purpose,
      code: await uniquePassCode(), source: 'walkin', status: 'AWAITING_APPROVAL', expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
    include: passInclude,
  });
  return json({ pass: passDto(pass) }, 201);
});
