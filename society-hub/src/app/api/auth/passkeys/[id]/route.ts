import { db } from '@/lib/db';
import { route } from '@/lib/http';
import { idParam } from '@/lib/validators';

export const DELETE = route({ access: 'user' }, async ({ user, params }) => {
  await db.credential.deleteMany({ where: { id: idParam(params.id), userId: user.id } });
  return { ok: true };
});
