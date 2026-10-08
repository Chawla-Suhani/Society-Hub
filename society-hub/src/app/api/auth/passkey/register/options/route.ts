import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransport } from '@simplewebauthn/server';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { route } from '@/lib/http';
import { saveChallenge } from '@/lib/challenges';

// Add a passkey (the user must already be signed in).
export const POST = route({ access: 'user' }, async ({ user }) => {
  const existing = await db.credential.findMany({ where: { userId: user.id } });
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: user.email || user.phone || 'account',
    userDisplayName: user.fullName,
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: (c.transports ? c.transports.split(',') : undefined) as AuthenticatorTransport[] | undefined })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await saveChallenge(`reg:${user.id}`, options.challenge, 'register', user.id);
  return options;
});
