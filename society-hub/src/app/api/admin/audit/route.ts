import { db } from '@/lib/db';
import { route } from '@/lib/http';
import type { AuditLogRow } from '@/types/api';

export const GET = route({ roles: ['admin'] }, async ({ user }) => {
  const rows = await db.auditLog.findMany({ where: { societyId: user.societyId }, orderBy: { id: 'desc' }, take: 100, include: { actor: { select: { fullName: true } } } });
  const logs: AuditLogRow[] = rows.map((l) => ({ id: l.id, action: l.action, target: l.target, meta: l.meta, createdAt: l.createdAt.toISOString(), actor: l.actor?.fullName ?? null }));
  return { logs };
});
