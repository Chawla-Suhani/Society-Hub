import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { ApiError, parse, z } from '@/lib/errors';
import { json, route } from '@/lib/http';
import { complaintDto } from '@/lib/dto';
import { randomToken } from '@/lib/crypto';
import { IMAGE_TYPES, uploadDir } from '@/lib/complaints';

const CATEGORIES = ['Plumbing', 'Electrical', 'Lift', 'Parking', 'Security', 'Cleaning', 'Noise', 'Other'] as const;

// Resident raises a complaint (multipart form: category, title, description, optional photo).
export const POST = route({ roles: ['resident'] }, async ({ user, req }) => {
  const form = await req.formData();
  const b = parse(
    z.object({
      category: z.enum(CATEGORIES),
      title: z.string().trim().min(4, 'Give the problem a short title').max(100),
      description: z.string().trim().max(1000).optional(),
    }),
    { category: form.get('category'), title: form.get('title'), description: form.get('description') ?? undefined },
  );

  let photoFile: string | undefined;
  const photo = form.get('photo');
  if (photo instanceof File && photo.size > 0) {
    const ext = IMAGE_TYPES[photo.type];
    if (!ext) throw new ApiError(400, 'Photo must be a JPG, PNG or WebP image', 'VALIDATION');
    if (photo.size > 3 * 1024 * 1024) throw new ApiError(400, 'Photo is too large (max 3 MB)', 'VALIDATION');
    photoFile = randomToken(16) + ext;
    await fs.mkdir(uploadDir(), { recursive: true });
    await fs.writeFile(path.join(uploadDir(), photoFile), Buffer.from(await photo.arrayBuffer()));
  }

  const c = await db.complaint.create({
    data: { societyId: user.societyId, flatId: user.flatId, userId: user.id, category: b.category, title: b.title, description: b.description, photoFile },
    include: { user: true, flat: true },
  });
  return json({ complaint: complaintDto(c) }, 201);
});

export const GET = route({ roles: ['resident', 'admin'] }, async ({ user, query }) => {
  const { status } = query(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional() }));
  const rows = await db.complaint.findMany({
    where: { societyId: user.societyId, ...(user.role === 'resident' && { userId: user.id }), ...(status && { status }) },
    include: { user: true, flat: true },
    orderBy: { id: 'desc' },
  });
  return { complaints: rows.map(complaintDto) };
});
