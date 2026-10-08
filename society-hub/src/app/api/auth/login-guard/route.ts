import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { DUMMY_HASH, assertNotLocked, finishLogin, recordFailure } from '@/lib/session';
import { phone, pin } from '@/lib/validators';

// Guard: mobile number + 6-digit PIN (the admin creates the account).
export const POST = route<undefined>({ access: 'none', limit: true }, async ({ req, body, setCookie }) => {
  const b = await body(z.object({ phone, pin }));
  const user = await db.user.findFirst({ where: { role: 'guard', phone: b.phone } });
  assertNotLocked(user);
  const ok = await bcrypt.compare(b.pin, user?.pinHash || DUMMY_HASH);
  if (!user || !ok) {
    await recordFailure(user);
    throw new ApiError(401, 'Wrong mobile number or PIN', 'BAD_CREDENTIALS');
  }
  if (user.status !== 'ACTIVE') throw new ApiError(403, 'This guard account is disabled. Contact the admin.', 'SUSPENDED');
  return finishLogin(req, setCookie, user);
});
