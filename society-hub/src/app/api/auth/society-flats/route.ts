import { db } from '@/lib/db';
import { route } from '@/lib/http';
import type { WingWithFlats } from '@/types/api';

// Wings and flats of the signed-in resident's own society (used when re-applying after a rejection).
export const GET = route({ access: 'user' }, async ({ user }) => {
  const wings = await db.wing.findMany({
    where: { societyId: user.societyId },
    orderBy: { name: 'asc' },
    include: { flats: { orderBy: [{ floor: 'asc' }, { label: 'asc' }] } },
  });
  const out: WingWithFlats[] = wings.map((w) => ({ id: w.id, name: w.name, flats: w.flats.map((f) => ({ id: f.id, label: f.label, floor: f.floor })) }));
  return { wings: out };
});
