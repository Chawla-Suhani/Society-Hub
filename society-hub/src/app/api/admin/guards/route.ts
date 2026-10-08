import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { json, route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { phone, pin } from '@/lib/validators';
import type { GuardRow } from '@/types/api';

export const GET = route({ roles: ['admin'] }, async ({ user }) => {
  const guards = await db.user.findMany({
    where: { societyId: user.societyId, role: 'guard' },
    include: { sessions: { where: { revoked: false, expiresAt: { gt: new Date() } }, select: { id: true } } },
    orderBy: { id: 'asc' },
  });
  const out: GuardRow[] = guards.map((g) => ({ id: g.id, fullName: g.fullName, phone: g.phone, status: g.status, createdAt: g.createdAt.toISOString(), signedIn: g.sessions.length > 0 }));
  return { guards: out };
});

// Only the admin creates guard accounts.
export const POST = route({ roles: ['admin'] }, async ({ user, body }) => {
  const b = await body(z.object({ fullName: z.string().trim().min(2).max(80), phone, pin }));
  if (await db.user.findUnique({ where: { phone: b.phone } })) throw new ApiError(409, 'That mobile number is already registered', 'DUPLICATE');
  const guard = await db.user.create({
    data: { societyId: user.societyId, role: 'guard', status: 'ACTIVE', fullName: b.fullName, phone: b.phone, pinHash: await bcrypt.hash(b.pin, 11) },
  });
  await audit(user, 'guard.created', guard.id, { name: b.fullName });
  return json({ id: guard.id }, 201);
});
