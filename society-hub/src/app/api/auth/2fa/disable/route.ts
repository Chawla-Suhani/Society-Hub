import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { verifyTotp } from '@/lib/totp';

export const POST = route({ access: 'user' }, async ({ user, body }) => {
  if (user.role === 'admin') throw new ApiError(403, 'Admins must keep 2FA on', 'FORBIDDEN');
  const b = await body(z.object({ password: z.string(), code: z.string() }));
  if (!(await bcrypt.compare(b.password, user.passwordHash || '')) || !verifyTotp(user, b.code)) {
    throw new ApiError(401, 'Password or code is wrong', 'BAD_CREDENTIALS');
  }
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  await db.recoveryCode.deleteMany({ where: { userId: user.id } });
  return { ok: true };
});
