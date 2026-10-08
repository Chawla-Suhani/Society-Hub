import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { randomCode, sha256 } from '@/lib/crypto';
import { verifyTotp } from '@/lib/totp';

export const POST = route({ access: 'user' }, async ({ user, body }) => {
  const { code } = await body(z.object({ code: z.string() }));
  if (user.totpEnabled) throw new ApiError(409, '2FA is already on', 'ALREADY_ENABLED');
  if (!verifyTotp(user, code)) throw new ApiError(400, 'That code did not match. Check the time on your phone.', 'BAD_CODE');

  const codes = Array.from({ length: 8 }, () => randomCode(10));
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpEnabled: true } }),
    db.recoveryCode.deleteMany({ where: { userId: user.id } }),
    db.recoveryCode.createMany({ data: codes.map((c) => ({ userId: user.id, codeHash: sha256(c) })) }),
  ]);
  await audit(user, '2fa.enabled', user.id);
  // Shown once. Only hashes are stored.
  return { recoveryCodes: codes.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`) };
});
