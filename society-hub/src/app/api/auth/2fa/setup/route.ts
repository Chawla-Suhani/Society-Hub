import QRCode from 'qrcode';
import { generateSecret, generateURI } from 'otplib';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { encrypt } from '@/lib/crypto';

export const POST = route({ access: 'user' }, async ({ user }) => {
  if (user.totpEnabled) throw new ApiError(409, '2FA is already on', 'ALREADY_ENABLED');
  const secret = generateSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecret: encrypt(secret) } });
  const otpauthUrl = generateURI({ issuer: 'Society Hub', label: user.email || user.phone || 'account', secret });
  return { secret, otpauthUrl, qr: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) };
});
