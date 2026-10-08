import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { ApiError, errMessage, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { takeChallenge } from '@/lib/challenges';

export const POST = route({ access: 'user' }, async ({ user, body }) => {
  const b = await body(z.object({ response: z.any(), label: z.string().trim().max(60).optional() }));
  const response = b.response as RegistrationResponseJSON;
  const ch = await takeChallenge(`reg:${user.id}`, 'register');
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: config.origin, expectedRPID: config.rpID });
  } catch (e) {
    throw new ApiError(400, `Passkey could not be verified: ${errMessage(e)}`, 'PASSKEY_FAILED');
  }
  if (!verification.verified) throw new ApiError(400, 'Passkey could not be verified', 'PASSKEY_FAILED');

  const { credential } = verification.registrationInfo;
  await db.credential.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: (response.response?.transports || []).join(','),
      label: b.label || 'Passkey',
    },
  });
  await audit(user, 'passkey.added', user.id);
  return { ok: true };
});
