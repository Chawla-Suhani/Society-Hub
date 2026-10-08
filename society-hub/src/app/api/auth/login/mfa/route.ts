import jwt from 'jsonwebtoken';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { assertNotLocked, finishLogin, recordFailure } from '@/lib/session';
import { useRecoveryCode, verifyTotp } from '@/lib/totp';

// Second step: 6-digit authenticator code or a one-time recovery code.
export const POST = route<undefined>({ access: 'none', limit: true }, async ({ req, body, setCookie }) => {
  const { mfaToken, code, recoveryCode } = await body(z.object({ mfaToken: z.string(), code: z.string().optional(), recoveryCode: z.string().optional() }));
  let payload: { sub: number; typ: string };
  try {
    payload = jwt.verify(mfaToken, config.jwtSecret) as unknown as { sub: number; typ: string };
  } catch {
    throw new ApiError(401, 'That step expired. Sign in again.', 'MFA_EXPIRED');
  }
  if (payload.typ !== 'mfa') throw new ApiError(401, 'Invalid request', 'MFA_EXPIRED');
  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status === 'SUSPENDED') throw new ApiError(401, 'Account unavailable', 'MFA_EXPIRED');

  assertNotLocked(user);
  const ok = recoveryCode ? await useRecoveryCode(user.id, recoveryCode) : verifyTotp(user, code);
  if (!ok) {
    await recordFailure(user);
    throw new ApiError(401, 'That code did not work', 'BAD_CODE');
  }
  return finishLogin(req, setCookie, user);
});
