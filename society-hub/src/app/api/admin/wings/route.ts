import { db } from '@/lib/db';
import { ApiError, z } from '@/lib/errors';
import { json, route } from '@/lib/http';
import { audit } from '@/lib/audit';
import type { Wing } from '@/types/api';

export const GET = route({ roles: ['admin'] }, async ({ user }) => {
  const wings = await db.wing.findMany({ where: { societyId: user.societyId }, orderBy: { name: 'asc' }, include: { _count: { select: { flats: true } } } });
  const residents = await db.user.findMany({
    where: { societyId: user.societyId, role: 'resident', status: 'ACTIVE' },
    select: { flat: { select: { wingId: true } } },
  });
  const perWing = new Map<number, number>();
  for (const r of residents) if (r.flat) perWing.set(r.flat.wingId, (perWing.get(r.flat.wingId) ?? 0) + 1);
  const out: Wing[] = wings.map((w) => ({
    id: w.id, name: w.name, floors: w.floors, flatsPerFloor: w.flatsPerFloor, flatCount: w._count.flats, residentCount: perWing.get(w.id) ?? 0,
  }));
  return { wings: out };
});

// Create a wing and auto-generate its flats: wing A, 5 floors x 4 flats -> A-101 ... A-504
export const POST = route({ roles: ['admin'] }, async ({ user, body }) => {
  const b = await body(
    z.object({
      name: z.string().trim().min(1).max(20),
      floors: z.coerce.number().int().min(1).max(60),
      flatsPerFloor: z.coerce.number().int().min(1).max(20),
    }),
  );
  if (await db.wing.findUnique({ where: { societyId_name: { societyId: user.societyId, name: b.name } } })) {
    throw new ApiError(409, `Wing ${b.name} already exists`, 'DUPLICATE');
  }
  const wing = await db.$transaction(async (tx) => {
    const w = await tx.wing.create({ data: { societyId: user.societyId, name: b.name, floors: b.floors, flatsPerFloor: b.flatsPerFloor } });
    const flats = [];
    for (let floor = 1; floor <= b.floors; floor++) {
      for (let n = 1; n <= b.flatsPerFloor; n++) {
        flats.push({ societyId: user.societyId, wingId: w.id, floor, label: `${b.name}-${floor}${String(n).padStart(2, '0')}` });
      }
    }
    await tx.flat.createMany({ data: flats });
    return w;
  });
  await audit(user, 'wing.created', b.name, { floors: b.floors, flatsPerFloor: b.flatsPerFloor });
  return json({ wing }, 201);
});
