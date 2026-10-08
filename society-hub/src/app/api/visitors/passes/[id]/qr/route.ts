import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { idParam } from '@/lib/validators';

export const GET = route({ roles: ['resident'] }, async ({ user, params }) => {
  const p = await db.visitorPass.findFirst({ where: { id: idParam(params.id), societyId: user.societyId, flatId: user.flatId ?? -1 } });
  if (!p) throw new ApiError(404, 'Pass not found', 'NOT_FOUND');
  return { code: p.code, qr: await QRCode.toDataURL(p.code, { margin: 1, width: 280 }) };
});
