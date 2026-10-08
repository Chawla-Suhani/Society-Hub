import { db } from '@/lib/db';
import { route } from '@/lib/http';
import type { PasskeyRow } from '@/types/api';

export const GET = route({ access: 'user' }, async ({ user }) => {
  const rows = await db.credential.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
  const passkeys: PasskeyRow[] = rows.map((c) => ({ id: c.id, label: c.label, createdAt: c.createdAt.toISOString() }));
  return { passkeys };
});
