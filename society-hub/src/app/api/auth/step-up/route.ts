import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { assertNotLocked, recordFailure } from '@/lib/session';
import { verifyTotp } from '@/lib/totp';

// Re-confirm with an authenticator code before sensitive admin actions (valid for 5 minutes).
export const POST = route({ access: 'user', limit: true }, async ({ user, session, body }) => {
  const { code } = await body(z.object({ code: z.string() }));
  if (!user.totpEnabled) throw new ApiError(400, 'Turn on 2FA first', 'MFA_SETUP_REQUIRED');
  assertNotLocked(user);
  if (!verifyTotp(user, code)) {
    await recordFailure(user);
    throw new ApiError(401, 'That code did not work', 'BAD_CODE');
  }
  await db.session.update({ where: { id: session.id }, data: { stepupUntil: new Date(Date.now() + 5 * 60 * 1000) } });
  return { ok: true };
});
