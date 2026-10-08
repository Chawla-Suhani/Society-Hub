const isProd = process.env.NODE_ENV === 'production';
const origin = process.env.ORIGIN || 'http://localhost:3000';

export const config = {
  isProd,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  // Encrypts TOTP secrets at rest. Falls back to JWT_SECRET in dev.
  encKey: process.env.ENC_KEY || process.env.JWT_SECRET || 'dev-only-secret-change-me',
  // WebAuthn (passkeys): rpID is the site's hostname, origin is the full URL the browser shows.
  rpName: 'Society Hub',
  rpID: process.env.RP_ID || 'localhost',
  origin,
  // Cookies are Secure in production. Set COOKIE_SECURE=false to run a production build over plain http.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  rateLimit: Number(process.env.RATE_LIMIT || 60), // auth requests per minute per IP
};

// Fail loudly if a production deploy forgot its secrets. (Skipped during `next build`, which only collects routes.)
if (isProd && process.env.NEXT_PHASE !== 'phase-production-build' && !process.env.JWT_SECRET) {
  throw new Error('Set JWT_SECRET (and ENC_KEY) in production.');
}
