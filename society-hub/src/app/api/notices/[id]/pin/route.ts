import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { route } from '@/lib/http';
import { idParam } from '@/lib/validators';

export const PATCH = route({ roles: ['admin'] }, async ({ user, params, body }) => {
  const { pinned } = await body(z.object({ pinned: z.boolean() }));
  const { count } = await db.notice.updateMany({ where: { id: idParam(params.id), societyId: user.societyId }, data: { pinned } });
  if (!count) throw new ApiError(404, 'Notice not found', 'NOT_FOUND');
  return { ok: true };
});
