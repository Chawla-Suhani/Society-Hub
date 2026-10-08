import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route, json } from '@/lib/http';
import { assertUnique, buildMe, startSession } from '@/lib/session';
import { email, id, password, phone, residentType } from '@/lib/validators';

// Resident signs up with the society code and picks their flat. Status starts as PENDING.
export const POST = route<undefined>({ access: 'none', limit: true }, async ({ req, body, setCookie }) => {
  const b = await body(
    z.object({
      societyCode: z.string().trim().toUpperCase().min(4),
      fullName: z.string().trim().min(2).max(80),
      email,
      phone,
      password,
      flatId: id,
      residentType,
      proofNote: z.string().trim().max(300).optional(),
    }),
  );
  const society = await db.society.findUnique({ where: { code: b.societyCode } });
  if (!society) throw new ApiError(404, 'No society found with that code', 'SOCIETY_NOT_FOUND');
  const flat = await db.flat.findFirst({ where: { id: b.flatId, societyId: society.id } });
  if (!flat) throw new ApiError(400, 'Please pick a flat from this society', 'VALIDATION');
  await assertUnique(b.email, b.phone);

  const user = await db.user.create({
    data: {
      societyId: society.id, role: 'resident', status: 'PENDING', fullName: b.fullName, email: b.email, phone: b.phone,
      passwordHash: await bcrypt.hash(b.password, 11), flatId: flat.id, residentType: b.residentType, proofNote: b.proofNote,
    },
  });
  await startSession(req, setCookie, user);
  return json({ user: await buildMe(user) }, 201);
});
