import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransport } from '@simplewebauthn/server';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { z } from '@/lib/errors';
import { route } from '@/lib/http';
import { randomToken } from '@/lib/crypto';
import { saveChallenge } from '@/lib/challenges';

export const POST = route<undefined>({ access: 'none', limit: true }, async ({ body }) => {
  const { identifier } = await body(z.object({ identifier: z.string().trim().toLowerCase().optional() }));
  let allow: Array<{ id: string; transports?: AuthenticatorTransport[] }> | undefined;
  if (identifier) {
    const user = await db.user.findFirst({ where: { role: { in: ['admin', 'resident'] }, OR: [{ email: identifier }, { phone: identifier }] }, include: { credentials: true } });
    if (user?.credentials.length) {
      allow = user.credentials.map((c) => ({ id: c.credentialId, transports: (c.transports ? c.transports.split(',') : undefined) as AuthenticatorTransport[] | undefined }));
    }
  }
  const options = await generateAuthenticationOptions({ rpID: config.rpID, allowCredentials: allow, userVerification: 'preferred' });
  const challengeId = randomToken(16);
  await saveChallenge(challengeId, options.challenge, 'login');
  return { options, challengeId };
});
