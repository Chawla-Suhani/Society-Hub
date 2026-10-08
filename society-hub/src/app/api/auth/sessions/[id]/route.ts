import { db } from '@/lib/db';
import { route } from '@/lib/http';

export const DELETE = route({ access: 'user' }, async ({ user, params }) => {
  await db.session.updateMany({ where: { id: params.id, userId: user.id }, data: { revoked: true } });
  return { ok: true };
});
