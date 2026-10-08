import path from 'node:path';
import type { User } from '@/generated/prisma/client';
import { config } from './config';
import { db } from './db';
import { ApiError } from './errors';
import { idParam } from './validators';

export const uploadDir = (): string => path.resolve(process.cwd(), config.uploadDir);
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
export const MIME_BY_EXT: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// A resident can only open their own complaints; the admin can open all in the society.
export async function loadComplaint(user: User, idStr: string | undefined) {
  const c = await db.complaint.findFirst({
    where: { id: idParam(idStr), societyId: user.societyId, ...(user.role === 'resident' && { userId: user.id }) },
    include: { user: true, flat: true },
  });
  if (!c) throw new ApiError(404, 'Complaint not found', 'NOT_FOUND');
  return c;
}
