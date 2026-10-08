import { db } from '@/lib/db';
import { route } from '@/lib/http';
import type { SessionRow } from '@/types/api';

export const GET = route({ access: 'user' }, async ({ user, session }) => {
  const rows = await db.session.findMany({
    where: { userId: user.id, revoked: false, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
  });
  const sessions: SessionRow[] = rows.map((s) => ({
    id: s.id, userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt.toISOString(), lastUsedAt: s.lastUsedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(), current: s.id === session.id,
  }));
  return { sessions };
});
