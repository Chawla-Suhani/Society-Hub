import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { DUMMY_HASH, assertNotLocked, finishLogin, recordFailure } from '@/lib/session';

// Admin / resident: email-or-phone + password. If 2FA is on, a second step follows.
export const POST = route<undefined>({ access: 'none', limit: true }, async ({ req, body, setCookie }) => {
  const { identifier, password } = await body(z.object({ identifier: z.string().trim().toLowerCase().min(3), password: z.string().min(1) }));
  const user = await db.user.findFirst({
    where: { role: { in: ['admin', 'resident'] }, OR: [{ email: identifier }, { phone: identifier }] },
  });

  assertNotLocked(user);
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) {
    await recordFailure(user);
    throw new ApiError(401, 'Wrong email/mobile or password', 'BAD_CREDENTIALS');
  }
  if (user.status === 'SUSPENDED') throw new ApiError(403, 'Your account has been suspended. Contact your society admin.', 'SUSPENDED');

  if (user.totpEnabled) {
    const mfaToken = jwt.sign({ sub: user.id, typ: 'mfa' }, config.jwtSecret, { expiresIn: '5m' });
    return { mfaRequired: true, mfaToken };
  }
  return finishLogin(req, setCookie, user);
});
