import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { randomToken, sha256 } from '@/lib/crypto';
import { issueCookies } from '@/lib/session';

// The access token lasts 15 minutes; the refresh cookie swaps it for a new one and rotates itself.
// Re-using an old refresh token revokes the session (stolen-token detection).
export const POST = route<undefined>({ access: 'none' }, async ({ req, setCookie }) => {
  const rt = req.cookies.get('rt')?.value;
  if (!rt) throw new ApiError(401, 'Please sign in', 'NO_TOKEN');
  const [sid, secret] = rt.split('.');
  const session = sid ? await db.session.findUnique({ where: { id: sid } }) : null;
  if (!session || session.revoked || session.expiresAt < new Date()) throw new ApiError(401, 'Please sign in again', 'SESSION_REVOKED');
  if (session.refreshHash !== sha256(secret || '')) {
    await db.session.update({ where: { id: sid }, data: { revoked: true } });
    throw new ApiError(401, 'Please sign in again', 'SESSION_REVOKED');
  }
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === 'SUSPENDED') throw new ApiError(401, 'Account unavailable', 'SESSION_REVOKED');

  const next = randomToken(32);
  await db.session.update({ where: { id: sid }, data: { refreshHash: sha256(next), lastUsedAt: new Date() } });
  issueCookies(setCookie, sid, next);
  return { ok: true };
});
