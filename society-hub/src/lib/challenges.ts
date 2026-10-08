import type { Challenge } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './errors';

// WebAuthn challenges are single-use and expire after 5 minutes.
export async function saveChallenge(id: string, challenge: string, type: string, userId: number | null = null): Promise<void> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.challenge.upsert({ where: { id }, create: { id, challenge, type, userId, expiresAt }, update: { challenge, type, userId, expiresAt } });
}

export async function takeChallenge(id: string, type: string): Promise<Challenge> {
  const row = await db.challenge.findFirst({ where: { id, type } });
  if (row) await db.challenge.deleteMany({ where: { id } });
  if (!row || row.expiresAt < new Date()) throw new ApiError(400, 'That request expired. Try again.', 'CHALLENGE_EXPIRED');
  return row;
}
