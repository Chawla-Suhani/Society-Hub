import { db } from '@/lib/db';
import { z } from '@/lib/errors';
import { route } from '@/lib/http';
import { complaintDto } from '@/lib/dto';
import { loadComplaint } from '@/lib/complaints';
import type { CommentDto } from '@/types/api';

export const GET = route({ roles: ['resident', 'admin'] }, async ({ user, params }) => {
  const c = await loadComplaint(user, params.id);
  const rows = await db.complaintComment.findMany({ where: { complaintId: c.id }, orderBy: { id: 'asc' }, include: { user: true } });
  const comments: CommentDto[] = rows.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString(), author: m.user.fullName, authorRole: m.user.role }));
  return { complaint: complaintDto(c), comments };
});

// Admin moves it along: OPEN -> IN_PROGRESS -> RESOLVED, and says who is handling it.
export const PATCH = route({ roles: ['admin'] }, async ({ user, params, body }) => {
  const b = await body(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(), assignedTo: z.string().trim().max(80).optional() }));
  const c = await loadComplaint(user, params.id);
  const updated = await db.complaint.update({
    where: { id: c.id },
    data: { ...(b.status && { status: b.status }), ...(b.assignedTo !== undefined && { assignedTo: b.assignedTo || null }) },
    include: { user: true, flat: true },
  });
  return { complaint: complaintDto(updated) };
});
