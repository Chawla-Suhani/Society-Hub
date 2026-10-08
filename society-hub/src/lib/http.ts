import { NextRequest, NextResponse } from 'next/server';
import type { Session, User } from '@/generated/prisma/client';
import type { Role } from '@/generated/prisma/enums';
import { config } from './config';
import { ApiError, parse, z } from './errors';
import { authenticate } from './session';

// A tiny wrapper around Next.js route handlers so every endpoint is a few readable lines:
//   export const POST = route({ roles: ['admin'] }, async ({ body }) => { ... return { ok: true } });
// It handles auth, role checks, rate limiting, JSON/error responses and cookies in one place.

type Params = Record<string, string>;
type RouteCtx = { params: Promise<Params> };

interface CookieOp { name: string; value: string; path: string; maxAgeSec: number }

export interface Ctx<U extends User | undefined> {
  req: NextRequest;
  params: Params;
  user: U;
  session: U extends User ? Session : undefined;
  /** Typed request body, validated with zod. */
  body: <S extends z.ZodType>(schema: S) => Promise<z.output<S>>;
  /** Typed query string, validated with zod. */
  query: <S extends z.ZodType>(schema: S) => z.output<S>;
  setCookie: (name: string, value: string, path: string, maxAgeSec: number) => void;
  clearCookie: (name: string, path: string) => void;
  ip: string;
}

export interface RouteOptions {
  /** 'none' = public, 'user' = signed in (any status), 'active' = signed in + approved (+2FA for admins). Default 'active' when roles are given. */
  access?: 'none' | 'user' | 'active';
  roles?: Role[];
  /** Rate limit by IP (used on the auth endpoints). */
  limit?: boolean;
  /** Needs a fresh authenticator code (sensitive admin actions). */
  stepUp?: boolean;
}

export const json = (data: unknown, status = 200): NextResponse => NextResponse.json(data, { status });

const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  h.n += 1;
  return h.n > config.rateLimit;
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
}

export function route<U extends User | undefined = User>(
  opts: RouteOptions,
  fn: (ctx: Ctx<U>) => Promise<unknown>,
) {
  const access = opts.access ?? (opts.roles ? 'active' : 'user');
  return async (req: NextRequest, rc: RouteCtx): Promise<NextResponse> => {
    const cookies: Array<CookieOp | { clear: string; path: string }> = [];
    try {
      const ip = clientIp(req);
      if (opts.limit && rateLimited(ip)) throw new ApiError(429, 'Too many requests. Please wait a minute.', 'RATE_LIMIT');

      let user: User | undefined;
      let session: Session | undefined;
      if (access !== 'none') {
        ({ user, session } = await authenticate(req));
        if (access === 'active') {
          if (user.status !== 'ACTIVE') throw new ApiError(403, 'Your account is not active yet', user.status === 'PENDING' ? 'PENDING_APPROVAL' : 'NOT_ACTIVE');
          if (user.role === 'admin' && !user.totpEnabled) throw new ApiError(403, 'Set up two-factor authentication to continue', 'MFA_SETUP_REQUIRED');
        }
        if (opts.roles && !opts.roles.includes(user.role)) throw new ApiError(403, 'You do not have access to this', 'FORBIDDEN');
        if (opts.stepUp && !(session.stepupUntil && session.stepupUntil > new Date())) {
          throw new ApiError(403, 'Confirm with your authenticator code to continue', 'STEP_UP_REQUIRED');
        }
      }

      const ctx = {
        req,
        params: await rc.params,
        user,
        session,
        ip,
        body: async (schema: z.ZodType) => parse(schema, await req.json().catch(() => ({}))),
        query: (schema: z.ZodType) => parse(schema, Object.fromEntries(req.nextUrl.searchParams)),
        setCookie: (name: string, value: string, path: string, maxAgeSec: number) => cookies.push({ name, value, path, maxAgeSec }),
        clearCookie: (name: string, path: string) => cookies.push({ clear: name, path }),
      } as unknown as Ctx<U>;

      const out = await fn(ctx);
      const res = out instanceof Response ? (out as NextResponse) : NextResponse.json(out ?? { ok: true });
      for (const c of cookies) {
        if ('clear' in c) res.cookies.set(c.clear, '', { path: c.path, maxAge: 0 });
        else res.cookies.set(c.name, c.value, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: c.path, maxAge: c.maxAgeSec });
      }
      return res;
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'Something went wrong on our side', code: 'SERVER' }, { status: 500 });
    }
  };
}
