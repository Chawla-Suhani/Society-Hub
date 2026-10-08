import { db } from '@/lib/db';
import { route } from '@/lib/http';
import { idParam } from '@/lib/validators';
import type { FlatWithResidents } from '@/types/api';

export const GET = route({ roles: ['admin'] }, async ({ user, params }) => {
  const flats = await db.flat.findMany({
    where: { societyId: user.societyId, wingId: idParam(params.id) },
    orderBy: [{ floor: 'asc' }, { label: 'asc' }],
    include: { users: { where: { role: 'resident', status: { in: ['ACTIVE', 'PENDING'] } }, select: { id: true, fullName: true, status: true, residentType: true } } },
  });
  const out: FlatWithResidents[] = flats.map((f) => ({ id: f.id, label: f.label, floor: f.floor, residents: f.users }));
  return { flats: out };
});
