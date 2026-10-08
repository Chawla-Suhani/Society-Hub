import { db } from '@/lib/db';
import { z } from '@/lib/errors';
import { json, route } from '@/lib/http';
import { loadComplaint } from '@/lib/complaints';

export const POST = route({ roles: ['resident', 'admin'] }, async ({ user, params, body }) => {
  const { body: text } = await body(z.object({ body: z.string().trim().min(1).max(500) }));
  const c = await loadComplaint(user, params.id);
  await db.$transaction([
    db.complaintComment.create({ data: { complaintId: c.id, userId: user.id, body: text } }),
    db.complaint.update({ where: { id: c.id }, data: { updatedAt: new Date() } }),
  ]);
  return json({ ok: true }, 201);
});
