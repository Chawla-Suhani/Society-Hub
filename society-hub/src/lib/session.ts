import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Flat, Session, Society, User, Wing } from '@/generated/prisma/client';
import { config } from './config';
import { db } from './db';
import { ApiError } from './errors';
import { randomToken, sha256 } from './crypto';
import type { Me } from '@/types/api';

export const ACCESS_MIN = 15;
export const REFRESH_DAYS = 7;
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // keeps login timing similar for unknown users

// 1) Who are you? Verifies the access cookie, then checks the session and user in the DB on every request,
//    so revoking a session or suspending a user takes effect immediately.
export async function authenticate(req: NextRequest): Promise<{ user: User; session: Session }> {
  return authenticateToken(req.cookies.get('at')?.value);
}

export async function authenticateToken(token: string | undefined): Promise<{ user: User; session: Session }> {
  if (!token) throw new ApiError(401, 'Please sign in', 'NO_TOKEN');
  let payload: { sid?: string; typ?: string };
  try {
    payload = jwt.verify(token, config.jwtSecret) as { sid?: string; typ?: string };
  } catch {
    throw new ApiError(401, 'Session expired', 'TOKEN_EXPIRED');
  }
  if (payload.typ !== 'access' || !payload.sid) throw new ApiError(401, 'Invalid token', 'NO_TOKEN');

  const session = await db.session.findUnique({ where: { id: payload.sid } });
  if (!session || session.revoked || session.expiresAt < new Date()) throw new ApiError(401, 'This session was signed out', 'SESSION_REVOKED');
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === 'SUSPENDED') throw new ApiError(401, 'Account unavailable', 'SESSION_REVOKED');
  return { user, session };
}

type SetCookie = (name: string, value: string, path: string, maxAgeSec: number) => void;

export function issueCookies(setCookie: SetCookie, sid: string, refreshSecret: string): void {
  const access = jwt.sign({ sid, typ: 'access' }, config.jwtSecret, { expiresIn: `${ACCESS_MIN}m` });
  // The cookie outlives the 15-minute token inside it, so the server can tell "expired" (renew it) from "signed out".
  setCookie('at', access, '/', REFRESH_DAYS * 86400);
  setCookie('rt', `${sid}.${refreshSecret}`, '/api/auth', REFRESH_DAYS * 86400);
}

export async function startSession(req: NextRequest, setCookie: SetCookie, user: User): Promise<void> {
  const sid = randomToken(16);
  const secret = randomToken(32);
  await db.session.create({
    data: {
      id: sid,
      userId: user.id,
      refreshHash: sha256(secret),
      userAgent: (req.headers.get('user-agent') || '').slice(0, 200),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local',
      expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400 * 1000),
    },
  });
  issueCookies(setCookie, sid, secret);
}

// 5 wrong attempts = 15 minute lock.
export function assertNotLocked(user: User | null | undefined): void {
  if (user?.lockedUntil && user.lockedUntil > new Date()) throw new ApiError(423, 'Too many wrong attempts. Try again in 15 minutes.', 'LOCKED');
}
export async function recordFailure(user: User | null | undefined): Promise<void> {
  if (!user) return;
  const n = user.failedAttempts + 1;
  await db.user.update({
    where: { id: user.id },
    data: n >= 5 ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : { failedAttempts: n },
  });
}

export async function finishLogin(req: NextRequest, setCookie: SetCookie, user: User): Promise<{ user: Me }> {
  await db.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
  await startSession(req, setCookie, user);
  return { user: await buildMe(user) };
}

export async function buildMe(user: User): Promise<Me> {
  const society: Society = await db.society.findUniqueOrThrow({ where: { id: user.societyId } });
  const flat: (Flat & { wing: Wing }) | null = user.flatId ? await db.flat.findUnique({ where: { id: user.flatId }, include: { wing: true } }) : null;
  const passkeyCount = await db.credential.count({ where: { userId: user.id } });
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    residentType: user.residentType,
    rejectReason: user.rejectReason,
    totpEnabled: user.totpEnabled,
    passkeyCount,
    mfaSetupRequired: user.role === 'admin' && !user.totpEnabled,
    society: { id: society.id, name: society.name, code: user.role === 'admin' ? society.code : undefined },
    flat: flat ? { id: flat.id, label: flat.label, floor: flat.floor, wing: flat.wing.name, wingId: flat.wing.id } : null,
  };
}

export async function assertUnique(email?: string | null, phone?: string | null): Promise<void> {
  const or = [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])];
  if (or.length && (await db.user.findFirst({ where: { OR: or } }))) {
    throw new ApiError(409, 'An account with this email or mobile number already exists', 'DUPLICATE');
  }
}
