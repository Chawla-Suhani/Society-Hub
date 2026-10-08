import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { z } from '@/lib/errors';
import { route, json } from '@/lib/http';
import { randomCode } from '@/lib/crypto';
import { assertUnique, buildMe, startSession } from '@/lib/session';
import { email, password, phone } from '@/lib/validators';

// Admin signs up and creates a society in one step. They get a society code to share with residents.
export const POST = route<undefined>({ access: 'none', limit: true }, async ({ req, body, setCookie }) => {
  const b = await body(
    z.object({
      societyName: z.string().trim().min(3).max(80),
      address: z.string().trim().max(200).optional(),
      city: z.string().trim().max(60).optional(),
      fullName: z.string().trim().min(2).max(80),
      email,
      phone,
      password,
    }),
  );
  await assertUnique(b.email, b.phone);

  const prefix = b.societyName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  let code: string;
  do {
    code = `${prefix}-${randomCode(4)}`;
  } while (await db.society.findUnique({ where: { code } }));

  const passwordHash = await bcrypt.hash(b.password, 11);
  const user = await db.$transaction(async (tx) => {
    const society = await tx.society.create({ data: { name: b.societyName, code, address: b.address, city: b.city } });
    return tx.user.create({
      data: { societyId: society.id, role: 'admin', status: 'ACTIVE', fullName: b.fullName, email: b.email, phone: b.phone, passwordHash },
    });
  });
  await startSession(req, setCookie, user);
  return json({ user: await buildMe(user) }, 201); // mfaSetupRequired = true, so the UI sends them to set up 2FA
});
