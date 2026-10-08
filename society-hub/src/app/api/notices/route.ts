import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { json, route } from '@/lib/http';
import { audit } from '@/lib/audit';
import { noticeDto } from '@/lib/dto';

// Admin sees everything. Residents see society-wide notices plus notices for their own wing.
export const GET = route({ roles: ['admin', 'resident', 'guard'] }, async ({ user }) => {
  const flat = user.role === 'resident' && user.flatId ? await db.flat.findUnique({ where: { id: user.flatId } }) : null;
  const rows = await db.notice.findMany({
    where: {
      societyId: user.societyId,
      ...(user.role === 'resident' && { OR: [{ wingId: null }, { wingId: flat?.wingId ?? -1 }] }),
      ...(user.role === 'guard' && { wingId: null }),
    },
    include: { wing: true, createdBy: true },
    orderBy: [{ pinned: 'desc' }, { id: 'desc' }],
  });
  return { notices: rows.map(noticeDto) };
});

export const POST = route({ roles: ['admin'] }, async ({ user, body }) => {
  const b = await body(
    z.object({
      title: z.string().trim().min(3).max(120),
      body: z.string().trim().min(3).max(2000),
      pinned: z.boolean().default(false),
      wingId: z.coerce.number().int().positive().optional().nullable(),
    }),
  );
  if (b.wingId && !(await db.wing.findFirst({ where: { id: b.wingId, societyId: user.societyId } }))) {
    throw new ApiError(400, 'Pick a wing from your society', 'VALIDATION');
  }
  const n = await db.notice.create({ data: { societyId: user.societyId, wingId: b.wingId || null, title: b.title, body: b.body, pinned: b.pinned, createdById: user.id } });
  await audit(user, 'notice.posted', n.id, { title: b.title });
  return json({ id: n.id }, 201);
});
