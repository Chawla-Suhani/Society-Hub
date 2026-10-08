import { db } from '@/lib/db';
import { route } from '@/lib/http';

export const POST = route<undefined>({ access: 'none' }, async ({ req, clearCookie }) => {
  const sid = req.cookies.get('rt')?.value.split('.')[0];
  if (sid) await db.session.updateMany({ where: { id: sid }, data: { revoked: true } });
  clearCookie('at', '/');
  clearCookie('rt', '/api/auth');
  return { ok: true };
});
