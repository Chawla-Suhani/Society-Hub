import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { MIME_BY_EXT, loadComplaint, uploadDir } from '@/lib/complaints';

// Photos are not public files: they are served only to people allowed to see that complaint.
export const GET = route({ roles: ['resident', 'admin'] }, async ({ user, params }) => {
  const c = await loadComplaint(user, params.id);
  if (!c.photoFile) throw new ApiError(404, 'No photo', 'NOT_FOUND');
  const file = path.join(uploadDir(), path.basename(c.photoFile));
  const data = await fs.readFile(file).catch(() => null);
  if (!data) throw new ApiError(404, 'No photo', 'NOT_FOUND');
  return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': MIME_BY_EXT[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' } });
});
