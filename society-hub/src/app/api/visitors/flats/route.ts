import { db } from '@/lib/db';
import { route } from '@/lib/http';

// Guards need a flat list for walk-ins.
export const GET = route({ roles: ['guard'] }, async ({ user }) => {
  const flats = await db.flat.findMany({
    where: { societyId: user.societyId },
    include: { wing: true },
    orderBy: [{ wing: { name: 'asc' } }, { floor: 'asc' }, { label: 'asc' }],
  });
  return { flats: flats.map((f) => ({ id: f.id, label: f.label, wing: f.wing.name })) };
});
