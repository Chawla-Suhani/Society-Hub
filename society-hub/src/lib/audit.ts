import type { User } from '@/generated/prisma/client';
import { db } from './db';

export async function audit(actor: Pick<User, 'id' | 'societyId'> | null, action: string, target?: string | number | null, meta?: Record<string, unknown>): Promise<void> {
  await db.auditLog.create({
    data: {
      societyId: actor?.societyId ?? null,
      actorId: actor?.id ?? null,
      action,
      target: target == null ? null : String(target),
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
}
