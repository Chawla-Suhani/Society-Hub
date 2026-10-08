import { verifySync } from 'otplib';
import type { User } from '@/generated/prisma/client';
import { db } from './db';
import { decrypt, sha256 } from './crypto';

// Accepts the current code plus/minus one 30s step (clock drift).
export function verifyTotp(user: Pick<User, 'totpSecret'>, code: unknown): boolean {
  if (!user.totpSecret) return false;
  const token = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return verifySync({ secret: decrypt(user.totpSecret), token, epochTolerance: 30 }).valid === true;
  } catch {
    return false;
  }
}

export const normaliseRecoveryCode = (c: unknown): string => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Recovery codes are one-time use and stored hashed. updateMany with used:false makes "use it" atomic.
export async function useRecoveryCode(userId: number, code: unknown): Promise<boolean> {
  const hash = sha256(normaliseRecoveryCode(code));
  const { count } = await db.recoveryCode.updateMany({ where: { userId, codeHash: hash, used: false }, data: { used: true } });
  return count === 1;
}
