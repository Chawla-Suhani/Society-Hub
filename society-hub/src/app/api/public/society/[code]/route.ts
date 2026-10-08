import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import type { WingWithFlats } from '@/types/api';

// Society code -> wings -> flats, so a new resident can pick where they live (no sign-in needed).
export const GET = route<undefined>({ access: 'none' }, async ({ params }) => {
  const society = await db.society.findUnique({ where: { code: params.code.toUpperCase() } });
  if (!society) throw new ApiError(404, 'No society found with that code', 'SOCIETY_NOT_FOUND');
  const wings = await db.wing.findMany({
    where: { societyId: society.id },
    orderBy: { name: 'asc' },
    include: { flats: { orderBy: [{ floor: 'asc' }, { label: 'asc' }] } },
  });
  const out: WingWithFlats[] = wings.map((w) => ({
    id: w.id, name: w.name, floors: w.floors, flats: w.flats.map((f) => ({ id: f.id, label: f.label, floor: f.floor })),
  }));
  return { society: { id: society.id, name: society.name, city: society.city }, wings: out };
});
