import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { idParam } from '@/lib/validators';

export const DELETE = route({ roles: ['admin'] }, async ({ user, params }) => {
  const { count } = await db.notice.deleteMany({ where: { id: idParam(params.id), societyId: user.societyId } });
  if (!count) throw new ApiError(404, 'Notice not found', 'NOT_FOUND');
  await audit(user, 'notice.deleted', params.id);
  return { ok: true };
});
