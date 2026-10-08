import { db } from '@/lib/db';
import { z } from '@/lib/errors';
import { route } from '@/lib/http';
import type { ResidentRow } from '@/types/api';

export const GET = route({ roles: ['admin'] }, async ({ user, query }) => {
  const { status } = query(z.object({ status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']).optional() }));
  const rows = await db.user.findMany({
    where: { societyId: user.societyId, role: 'resident', ...(status && { status }) },
    include: { flat: { include: { wing: true } } },
    orderBy: { createdAt: 'desc' },
  });
  // Warn the admin if a flat already has an active owner and a second "owner" is applying.
  const owners = await db.user.findMany({
    where: { societyId: user.societyId, role: 'resident', status: 'ACTIVE', residentType: 'owner' },
    select: { flatId: true, fullName: true },
  });
  const residents: ResidentRow[] = rows.map((r) => ({
    id: r.id, fullName: r.fullName, email: r.email, phone: r.phone, status: r.status, residentType: r.residentType,
    proofNote: r.proofNote, rejectReason: r.rejectReason, createdAt: r.createdAt.toISOString(), flatId: r.flatId,
    flat: r.flat?.label ?? '', wing: r.flat?.wing.name ?? '',
    flatConflict: r.status === 'PENDING' && r.residentType === 'owner' ? owners.find((o) => o.flatId === r.flatId)?.fullName ?? null : null,
  }));
  return { residents };
});
