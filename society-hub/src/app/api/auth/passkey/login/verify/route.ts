import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorTransport } from '@simplewebauthn/server';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { ApiError, errMessage, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { takeChallenge } from '@/lib/challenges';
import { assertNotLocked, finishLogin } from '@/lib/session';

// Sign in with a passkey. No password and no 6-digit code: the passkey itself is the second factor.
export const POST = route<undefined>({ access: 'none', limit: true }, async ({ req, body, setCookie }) => {
  const b = await body(z.object({ challengeId: z.string(), response: z.any() }));
  const response = b.response as AuthenticationResponseJSON;
  const ch = await takeChallenge(b.challengeId, 'login');
  const cred = response?.id ? await db.credential.findUnique({ where: { credentialId: response.id } }) : null;
  if (!cred) throw new ApiError(401, 'This passkey is not registered', 'PASSKEY_FAILED');
  const user = await db.user.findUnique({ where: { id: cred.userId } });
  if (!user || user.status === 'SUSPENDED') throw new ApiError(403, 'Your account has been suspended.', 'SUSPENDED');
  assertNotLocked(user);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      credential: {
        id: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: cred.counter,
        transports: (cred.transports ? cred.transports.split(',') : undefined) as AuthenticatorTransport[] | undefined,
      },
    });
  } catch (e) {
    throw new ApiError(401, `Passkey check failed: ${errMessage(e)}`, 'PASSKEY_FAILED');
  }
  if (!verification.verified) throw new ApiError(401, 'Passkey check failed', 'PASSKEY_FAILED');

  await db.credential.update({ where: { id: cred.id }, data: { counter: verification.authenticationInfo.newCounter } });
  return finishLogin(req, setCookie, user);
});
