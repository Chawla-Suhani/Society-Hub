// End-to-end smoke test. Builds a temp SQLite database from schema.prisma, starts the real Next.js server
// on it, and drives the API over HTTP, like a browser would.
// Run:  npm test
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { generateSync } from 'otplib';
import { createDb } from './helpers/create-db';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'society-test-'));
const dbFile = path.join(tmp, 'test.db');
// Set before the app's db module is imported, so this process and the server share one database.
process.env.DATABASE_URL = `file:${dbFile}`;
// The test reads TOTP secrets straight from the database, so it needs the same encryption key as the server.
process.env.JWT_SECRET = 'test-secret';
process.env.ENC_KEY = 'test-enc-key';

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

let server: ChildProcess | undefined;
function shutdown(code: number): never {
  server?.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(code);
}

async function startServer(): Promise<string> {
  await createDb(dbFile);
  if (!fs.existsSync(path.resolve('.next/BUILD_ID'))) {
    console.log('  (no production build yet, running `next build` first. This takes a minute.)');
    const b = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
    if (b.status !== 0) shutdown(1);
  }
  const port = await freePort();
  server = spawn('npx', ['next', 'start', '-p', String(port)], {
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'test-secret', ENC_KEY: 'test-enc-key', COOKIE_SECURE: 'false', RATE_LIMIT: '100000', UPLOAD_DIR: path.join(tmp, 'uploads'), ORIGIN: `http://localhost:${port}`, RP_ID: 'localhost' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  let log = '';
  server.stdout?.on('data', (d) => (log += d));
  server.stderr?.on('data', (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/auth/me`)).status === 401) return `http://localhost:${port}`;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(log);
  shutdown(1);
}

let origin = '';
type Db = typeof import('../src/lib/db').db;
let db: Db;

/* ---------- tiny HTTP client with a cookie jar (one per "browser") ---------- */
interface Res { status: number; data: any; type: string | null } // eslint-disable-line @typescript-eslint/no-explicit-any

function client() {
  const jar: Record<string, string> = {};
  async function call(method: string, url: string, body?: unknown): Promise<Res> {
    const headers: Record<string, string> = {};
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.cookie = cookie;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const r = await fetch(`${origin}/api${url}`, { method, headers, body: payload });
    for (const sc of r.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i);
      if (/Expires=Thu, 01 Jan 1970/.test(sc)) delete jar[k];
      else jar[k] = pair.slice(i + 1);
    }
    const isJson = (r.headers.get('content-type') || '').includes('json');
    return { status: r.status, data: isJson ? await r.json() : Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') };
  }
  return {
    jar,
    get: (u: string) => call('GET', u),
    post: (u: string, b: unknown = {}) => call('POST', u, b),
    patch: (u: string, b: unknown = {}) => call('PATCH', u, b),
    del: (u: string) => call('DELETE', u),
    form: (u: string, f: FormData) => call('POST', u, f),
    // Fetch a real page (not the API) without following redirects, to test the server-side route guards.
    page: async (u: string) => {
      const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(`${origin}${u}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
      return { status: r.status, location: r.headers.get('location')?.replace(origin, '') ?? null, html: r.status === 200 ? await r.text() : '' };
    },
  };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
    shutdown(1);
  }
}
const is = (res: Res, status: number, code?: string) => {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${JSON.stringify(res.data)}`);
  if (code) assert.equal(res.data.code, code);
  return res.data;
};
const totpFor = async (userId: number): Promise<string> => {
  const { decrypt } = await import('../src/lib/crypto');
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return generateSync({ secret: decrypt(u.totpSecret!) });
};
async function enable2fa(c: ReturnType<typeof client>): Promise<string[]> {
  const setup = is(await c.post('/auth/2fa/setup'), 200);
  assert.ok(setup.qr.startsWith('data:image/png'));
  const code = generateSync({ secret: setup.secret });
  return is(await c.post('/auth/2fa/enable', { code }), 200).recoveryCodes;
}

async function main(): Promise<void> {
  origin = await startServer();
  ({ db } = await import('../src/lib/db'));
  const admin = client(), resident = client(), resident2 = client(), guardC = client(), otherAdmin = client();
  let society: { code: string }, adminId: number, residentId: number, resident2Id: number, guardId: number, wingA: number, wingB: number, flatA101: number, flatB101: number;
  let pass: { id: number; code: string; status: string }, recovery: string[];

  console.log('\nSociety Hub smoke test\n');

  await test('admin signs up, gets a society code, and must set up 2FA before using the app', async () => {
    const d = is(await admin.post('/auth/register-admin', {
      societyName: 'Green Meadows', city: 'Pune', fullName: 'Asha Admin', email: 'Admin@Test.com', phone: '9000000001', password: 'Passw0rdAdmin',
    }), 201);
    adminId = d.user.id;
    society = d.user.society;
    assert.match(society.code, /^GRE-[A-Z0-9]{4}$/);
    assert.equal(d.user.mfaSetupRequired, true);
    is(await admin.get('/admin/wings'), 403, 'MFA_SETUP_REQUIRED');
    recovery = await enable2fa(admin);
    assert.equal(recovery.length, 8);
    is(await admin.get('/admin/wings'), 200);
  });

  await test('weak and duplicate signups are rejected', async () => {
    is(await client().post('/auth/register-admin', { societyName: 'X Society', fullName: 'Bob', email: 'b@b.com', phone: '9000000099', password: 'short' }), 400, 'VALIDATION');
    is(await client().post('/auth/register-admin', { societyName: 'Another', fullName: 'Bob', email: 'admin@test.com', phone: '9000000098', password: 'Passw0rdAdmin' }), 409, 'DUPLICATE');
  });

  await test('admin creates wings and flats are generated (A-101 ...)', async () => {
    const a = is(await admin.post('/admin/wings', { name: 'A', floors: 3, flatsPerFloor: 2 }), 201);
    const b = is(await admin.post('/admin/wings', { name: 'B', floors: 2, flatsPerFloor: 2 }), 201);
    wingA = a.wing.id; wingB = b.wing.id;
    is(await admin.post('/admin/wings', { name: 'A', floors: 1, flatsPerFloor: 1 }), 409, 'DUPLICATE');
    const flats = is(await admin.get(`/admin/wings/${wingA}/flats`), 200).flats;
    assert.deepEqual(flats.map((f: any) => f.label), ['A-101', 'A-102', 'A-201', 'A-202', 'A-301', 'A-302']);
  });

  await test('resident sign-up page can load wings and flats from the society code', async () => {
    is(await client().get('/public/society/NOPE-0000'), 404);
    const d = is(await client().get(`/public/society/${society.code.toLowerCase()}`), 200);
    assert.equal(d.wings.length, 2);
    flatA101 = d.wings.find((w: any) => w.name === 'A').flats[0].id;
    flatB101 = d.wings.find((w: any) => w.name === 'B').flats[0].id;
  });

  await test('resident signs up as PENDING and is locked out of features until approved', async () => {
    const body = { societyCode: society.code, fullName: 'Ravi Resident', email: 'ravi@test.com', phone: '9111111111', password: 'Passw0rd1', flatId: flatA101, residentType: 'owner' };
    is(await client().post('/auth/register-resident', { ...body, societyCode: 'NOPE-0000' }), 404);
    const d = is(await resident.post('/auth/register-resident', body), 201);
    residentId = d.user.id;
    assert.equal(d.user.status, 'PENDING');
    assert.equal(is(await resident.get('/auth/me'), 200).user.flat.label, 'A-101');
    is(await resident.post('/visitors/passes', { visitorName: 'Guest' }), 403, 'PENDING_APPROVAL');
    is(await resident.get('/bills'), 403, 'PENDING_APPROVAL');
    is(await resident.get('/admin/residents'), 403, 'PENDING_APPROVAL'); // not active yet, so blocked before the role check
  });

  await test('a pending resident cannot approve themselves, and the admin sees the request', async () => {
    is(await resident.post(`/admin/residents/${residentId}/approve`), 403);
    const list = is(await admin.get('/admin/residents?status=PENDING'), 200).residents;
    assert.equal(list.length, 1);
    assert.equal(list[0].flat, 'A-101');
    assert.equal(list[0].wing, 'A');
    assert.equal(is(await admin.get('/admin/overview'), 200).pendingApprovals, 1);
  });

  await test('admin approves -> resident gets full access immediately', async () => {
    is(await admin.post(`/admin/residents/${residentId}/approve`), 200);
    is(await admin.post(`/admin/residents/${residentId}/approve`), 409, 'ALREADY_HANDLED');
    assert.equal(is(await resident.get('/auth/me'), 200).user.status, 'ACTIVE');
    is(await resident.get('/bills'), 200);
  });

  await test('reject needs a reason; rejected resident sees it and can re-apply', async () => {
    const d = is(await resident2.post('/auth/register-resident', { societyCode: society.code, fullName: 'Sonia Tenant', email: 'sonia@test.com', phone: '9222222222', password: 'Passw0rd2', flatId: flatB101, residentType: 'tenant', proofNote: 'Rent agreement' }), 201);
    resident2Id = d.user.id;
    is(await admin.post(`/admin/residents/${resident2Id}/reject`, { reason: '' }), 400);
    is(await admin.post(`/admin/residents/${resident2Id}/reject`, { reason: 'Could not verify tenancy' }), 200);
    const me = is(await resident2.get('/auth/me'), 200).user;
    assert.equal(me.status, 'REJECTED');
    assert.equal(me.rejectReason, 'Could not verify tenancy');
    assert.equal(is(await resident2.get('/auth/society-flats'), 200).wings.length, 2);
    is(await resident2.post('/auth/resident/reapply', { flatId: flatB101, residentType: 'tenant', proofNote: 'Attached agreement' }), 200);
    is(await admin.post(`/admin/residents/${resident2Id}/approve`), 200);
  });

  await test('societies are isolated: another admin cannot see or touch these residents', async () => {
    const d = is(await otherAdmin.post('/auth/register-admin', { societyName: 'Blue Heights', fullName: 'Other Admin', email: 'other@test.com', phone: '9000000002', password: 'Passw0rdOther' }), 201);
    await enable2fa(otherAdmin);
    is(await otherAdmin.post(`/admin/residents/${residentId}/approve`), 404);
    assert.equal(is(await otherAdmin.get('/admin/residents'), 200).residents.length, 0);
    is(await otherAdmin.get(`/public/society/${d.user.society.code}`), 200);
    is(await client().post('/auth/register-resident', { societyCode: d.user.society.code, fullName: 'Hacker', email: 'h@test.com', phone: '9333333333', password: 'Passw0rd3', flatId: flatA101, residentType: 'owner' }), 400); // flat from the other society
  });

  await test('admin creates a guard; guard logs in with PIN; admin-only areas stay closed', async () => {
    const g = is(await admin.post('/admin/guards', { fullName: 'Gopal Guard', phone: '9444444444', pin: '123456' }), 201);
    guardId = g.id;
    is(await admin.post('/admin/guards', { fullName: 'Dup', phone: '9444444444', pin: '123456' }), 409);
    is(await guardC.post('/auth/login-guard', { phone: '9444444444', pin: '000000' }), 401);
    is(await guardC.post('/auth/login-guard', { phone: '9444444444', pin: '123456' }), 200);
    is(await guardC.get('/admin/residents'), 403, 'FORBIDDEN');
    is(await guardC.get('/bills'), 403, 'FORBIDDEN');
    is(await guardC.get('/complaints'), 403, 'FORBIDDEN');
  });

  await test('resident creates a visitor pass with QR; guard verifies and checks in once only', async () => {
    const d = is(await resident.post('/visitors/passes', { visitorName: 'Delivery Dan', purpose: 'Courier', validHours: 4 }), 201);
    pass = d.pass;
    assert.equal(pass.status, 'APPROVED');
    assert.equal(pass.code.length, 8);
    const qr = is(await resident.get(`/visitors/passes/${pass.id}/qr`), 200);
    assert.ok(qr.qr.startsWith('data:image/png'));
    is(await resident2.get(`/visitors/passes/${pass.id}/qr`), 404); // other flat
    const v = is(await guardC.post('/visitors/verify', { code: pass.code.toLowerCase() }), 200);
    assert.equal(v.canCheckIn, true);
    assert.equal(v.pass.flat, 'A-101');
    // two guards scanning the same QR at the same moment: exactly one wins
    const results = await Promise.all([guardC.post('/visitors/check-in', { code: pass.code }), guardC.post('/visitors/check-in', { code: pass.code })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(is(await guardC.get('/visitors?scope=inside'), 200).passes.length, 1);
    is(await guardC.post('/visitors/check-out', { passId: pass.id }), 200);
  });

  await test('expired and cancelled passes are refused at the gate', async () => {
    const p = is(await resident.post('/visitors/passes', { visitorName: 'Late Larry' }), 201).pass;
    await db.visitorPass.update({ where: { id: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const v = is(await guardC.post('/visitors/verify', { code: p.code }), 200);
    assert.equal(v.pass.status, 'EXPIRED');
    is(await guardC.post('/visitors/check-in', { code: p.code }), 409, 'PASS_INVALID');
    const q = is(await resident.post('/visitors/passes', { visitorName: 'Cancel Cathy' }), 201).pass;
    is(await resident.post(`/visitors/passes/${q.id}/cancel`), 200);
    is(await guardC.post('/visitors/check-in', { code: q.code }), 409, 'PASS_INVALID');
    is(await guardC.post('/visitors/verify', { code: 'ZZZZZZZZ' }), 404);
  });

  await test('walk-in visitor: guard logs, resident approves, guard lets them in', async () => {
    const flats = is(await guardC.get('/visitors/flats'), 200).flats;
    const a101 = flats.find((f: any) => f.label === 'A-101');
    const w = is(await guardC.post('/visitors/walkin', { visitorName: 'Surprise Sam', flatId: a101.id }), 201).pass;
    assert.equal(w.status, 'AWAITING_APPROVAL');
    is(await guardC.post('/visitors/check-in', { passId: w.id }), 409, 'PASS_INVALID'); // not approved yet
    assert.equal(is(await resident.get('/visitors?scope=awaiting'), 200).passes.length, 1);
    assert.equal(is(await resident2.get('/visitors?scope=awaiting'), 200).passes.length, 0); // different flat
    is(await resident2.post(`/visitors/passes/${w.id}/decision`, { approve: true }), 404);
    is(await resident.post(`/visitors/passes/${w.id}/decision`, { approve: true }), 200);
    is(await guardC.post('/visitors/check-in', { passId: w.id }), 200);
  });

  await test('complaints: resident raises with photo, admin triages, others cannot peek', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const f = new FormData();
    f.set('category', 'Plumbing'); f.set('title', 'Leak in A-101 bathroom'); f.set('description', 'Water from ceiling');
    f.set('photo', new Blob([png], { type: 'image/png' }), 'leak.png');
    const c = is(await resident.form('/complaints', f), 201).complaint;
    assert.equal(c.hasPhoto, true);
    assert.equal(c.flat, 'A-101');
    is(await resident.form('/complaints', (() => { const x = new FormData(); x.set('category', 'Nope'); x.set('title', 'bad one'); return x; })()), 400);
    assert.equal(is(await resident2.get('/complaints'), 200).complaints.length, 0);
    is(await resident2.get(`/complaints/${c.id}`), 404);
    is(await otherAdmin.get(`/complaints/${c.id}`), 404);
    const photo = await admin.get(`/complaints/${c.id}/photo`);
    assert.equal(photo.status, 200);
    assert.equal(photo.type, 'image/png');
    is(await admin.patch(`/complaints/${c.id}`, { status: 'IN_PROGRESS', assignedTo: 'Plumber' }), 200);
    is(await resident.patch(`/complaints/${c.id}`, { status: 'RESOLVED' }), 403);
    is(await admin.post(`/complaints/${c.id}/comments`, { body: 'Plumber visits tomorrow 10am' }), 201);
    is(await resident.post(`/complaints/${c.id}/comments`, { body: 'Thanks!' }), 201);
    const detail = is(await resident.get(`/complaints/${c.id}`), 200);
    assert.equal(detail.complaint.status, 'IN_PROGRESS');
    assert.equal(detail.comments.length, 2);
    assert.equal(is(await admin.get('/admin/overview'), 200).openComplaints, 1);
  });

  await test('notices: society-wide vs wing-only visibility', async () => {
    is(await admin.post('/notices', { title: 'Water tank cleaning', body: 'Water off Sunday 10-2', pinned: true }), 201);
    is(await admin.post('/notices', { title: 'Wing A lift service', body: 'Lift 1 closed', wingId: wingA }), 201);
    is(await resident.post('/notices', { title: 'Fake', body: 'Fake notice' }), 403);
    assert.deepEqual(is(await resident.get('/notices'), 200).notices.map((n: any) => n.title), ['Water tank cleaning', 'Wing A lift service']); // A-101 sees both, pinned first
    assert.deepEqual(is(await resident2.get('/notices'), 200).notices.map((n: any) => n.title), ['Water tank cleaning']); // B wing: only society-wide
    assert.equal(is(await guardC.get('/notices'), 200).notices.length, 1);
  });

  await test('bills: generate, no duplicates, pay once, receipt PDF, totals and defaulters', async () => {
    const g = is(await admin.post('/bills/generate', { period: '2026-08', amount: 2500, dueDate: '2026-08-10' }), 201);
    assert.equal(g.created, 10);
    assert.equal(is(await admin.post('/bills/generate', { period: '2026-08', amount: 2500, dueDate: '2026-08-10' }), 201).created, 0);
    is(await admin.post('/bills/generate', { period: '2026-10', amount: 2500, dueDate: '2099-10-10', wingId: wingA }), 201);

    const mine = is(await resident.get('/bills'), 200).bills;
    assert.equal(mine.length, 2); // only A-101's own bills
    const aug = mine.find((b: any) => b.period === '2026-08');
    assert.equal(aug.overdue, true);
    is(await resident2.post(`/bills/${aug.id}/pay`), 404); // not their flat
    is(await resident.get(`/bills/${aug.id}/receipt`), 400); // unpaid
    const pays = await Promise.all([resident.post(`/bills/${aug.id}/pay`), resident.post(`/bills/${aug.id}/pay`)]);
    assert.deepEqual(pays.map((r) => r.status).sort(), [200, 409]); // double click cannot pay twice
    const pdf = await resident.get(`/bills/${aug.id}/receipt`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.type, 'application/pdf');
    assert.equal(pdf.data.slice(0, 4).toString(), '%PDF');

    const all = is(await admin.get('/bills?period=2026-08'), 200);
    assert.equal(all.totals.collected, 2500);
    assert.equal(all.totals.outstanding, 9 * 2500);
    const def = is(await admin.get('/bills/defaulters'), 200).defaulters;
    assert.equal(def.length, 9);
    const b101 = all.bills.find((b: any) => b.flat === 'B-101');
    is(await admin.post(`/bills/${b101.id}/mark-paid`, { method: 'CASH', ref: 'Receipt #12' }), 200);
    assert.equal(is(await admin.get('/bills/defaulters'), 200).defaulters.length, 8);
  });

  await test('sensitive admin actions need a fresh 2FA step-up; suspension kicks the user out instantly', async () => {
    is(await admin.post(`/admin/residents/${resident2Id}/suspend`), 403, 'STEP_UP_REQUIRED');
    is(await admin.post('/auth/step-up', { code: '000000' }), 401, 'BAD_CODE');
    is(await admin.post('/auth/step-up', { code: await totpFor(adminId) }), 200);
    is(await admin.post(`/admin/residents/${resident2Id}/suspend`), 200);
    is(await resident2.get('/auth/me'), 401); // same cookies, but the session is dead
    is(await client().post('/auth/login', { identifier: 'sonia@test.com', password: 'Passw0rd2' }), 403, 'SUSPENDED');
    is(await admin.post(`/admin/residents/${resident2Id}/reactivate`), 200);
    is(await client().post('/auth/login', { identifier: 'sonia@test.com', password: 'Passw0rd2' }), 200);
  });

  await test('admin can disable a guard (phone lost): session ends and login is refused', async () => {
    is(await admin.post(`/admin/guards/${guardId}/disable`), 200); // step-up still fresh
    is(await guardC.get('/visitors'), 401);
    is(await client().post('/auth/login-guard', { phone: '9444444444', pin: '123456' }), 403, 'SUSPENDED');
    is(await admin.post(`/admin/guards/${guardId}/enable`), 200);
    is(await guardC.post('/auth/login-guard', { phone: '9444444444', pin: '123456' }), 200);
  });

  await test('login with 2FA: password -> code; wrong code refused; recovery code works exactly once', async () => {
    const c = client();
    const step1 = is(await c.post('/auth/login', { identifier: 'admin@test.com', password: 'Passw0rdAdmin' }), 200);
    assert.equal(step1.mfaRequired, true);
    assert.equal(c.jar.at, undefined); // no session yet
    is(await c.post('/auth/login/mfa', { mfaToken: step1.mfaToken, code: '123456' }), 401, 'BAD_CODE');
    is(await c.post('/auth/login/mfa', { mfaToken: step1.mfaToken, code: await totpFor(adminId) }), 200);
    assert.ok(c.jar.at);
    assert.equal(is(await c.get('/auth/me'), 200).user.role, 'admin');

    const c2 = client();
    const s2 = is(await c2.post('/auth/login', { identifier: '9000000001', password: 'Passw0rdAdmin' }), 200); // phone works too
    is(await c2.post('/auth/login/mfa', { mfaToken: s2.mfaToken, recoveryCode: recovery[0] }), 200);
    const c3 = client();
    const s3 = is(await c3.post('/auth/login', { identifier: 'admin@test.com', password: 'Passw0rdAdmin' }), 200);
    is(await c3.post('/auth/login/mfa', { mfaToken: s3.mfaToken, recoveryCode: recovery[0] }), 401, 'BAD_CODE'); // already used
    is(await c3.post('/auth/login/mfa', { mfaToken: s3.mfaToken, recoveryCode: recovery[1].toLowerCase() }), 200);
  });

  await test('5 wrong passwords lock the account for 15 minutes', async () => {
    const c = client();
    for (let i = 0; i < 5; i++) is(await c.post('/auth/login', { identifier: 'ravi@test.com', password: 'wrong-pass1' }), 401);
    is(await c.post('/auth/login', { identifier: 'ravi@test.com', password: 'Passw0rd1' }), 423, 'LOCKED'); // even the right password
    await db.user.update({ where: { id: residentId }, data: { lockedUntil: null } });
    is(await c.post('/auth/login', { identifier: 'ravi@test.com', password: 'Passw0rd1' }), 200);
  });

  await test('refresh rotates the token; replaying an old refresh token kills the session', async () => {
    const c = client();
    is(await c.post('/auth/login', { identifier: 'ravi@test.com', password: 'Passw0rd1' }), 200);
    const oldRt = c.jar.rt;
    is(await c.post('/auth/refresh'), 200);
    assert.notEqual(c.jar.rt, oldRt);
    const thief = client();
    thief.jar.rt = oldRt;
    is(await thief.post('/auth/refresh'), 401, 'SESSION_REVOKED');
    is(await c.post('/auth/refresh'), 401, 'SESSION_REVOKED'); // the real session is revoked too
  });

  await test('sessions list, revoke another device, and logout', async () => {
    const phone = client(), laptop = client();
    is(await phone.post('/auth/login', { identifier: 'ravi@test.com', password: 'Passw0rd1' }), 200);
    is(await laptop.post('/auth/login', { identifier: 'ravi@test.com', password: 'Passw0rd1' }), 200);
    const list = is(await laptop.get('/auth/sessions'), 200).sessions;
    const other = list.find((s: any) => !s.current);
    assert.ok(list.some((s: any) => s.current) && other);
    is(await laptop.del(`/auth/sessions/${other.id}`), 200);
    is(await laptop.post('/auth/logout'), 200);
    is(await laptop.get('/auth/me'), 401);
  });

  await test('passkey endpoints produce valid WebAuthn challenges (full ceremony needs a real browser)', async () => {
    const opts = is(await resident.post('/auth/passkey/register/options'), 200);
    assert.ok(opts.challenge && opts.rp.id === 'localhost' && opts.user.name === 'ravi@test.com');
    is(await resident.post('/auth/passkey/register/verify', { response: { id: 'x', rawId: 'x', type: 'public-key', response: {}, clientExtensionResults: {} } }), 400, 'PASSKEY_FAILED');
    const login = is(await client().post('/auth/passkey/login/options', {}), 200);
    assert.ok(login.options.challenge && login.challengeId);
    is(await client().post('/auth/passkey/login/verify', { challengeId: login.challengeId, response: { id: 'unknown' } }), 401, 'PASSKEY_FAILED');
    is(await client().post('/auth/passkey/login/verify', { challengeId: login.challengeId, response: { id: 'unknown' } }), 400, 'CHALLENGE_EXPIRED'); // single use
  });

  await test('page guards: each role lands on its own screen, strangers go to /login', async () => {
    const goes = async (c: ReturnType<typeof client>, url: string, status: number, to: string | null) => {
      const r = await c.page(url);
      assert.equal(r.status, status, `${url}: expected ${status}, got ${r.status}`);
      if (to) assert.equal(r.location, to, `${url}: expected redirect to ${to}, got ${r.location}`);
    };
    const nobody = client();
    await goes(nobody, '/admin', 307, '/login');
    await goes(nobody, '/visitors', 307, '/login');
    await goes(nobody, '/', 307, '/login');
    await goes(nobody, '/login', 200, null);
    await goes(nobody, '/signup/resident', 200, null);

    const ravi = client();
    is(await ravi.post('/auth/login', { identifier: 'ravi@test.com', password: 'Passw0rd1' }), 200);
    await goes(ravi, '/visitors', 200, null);
    await goes(ravi, '/admin', 307, '/visitors'); // wrong role: sent to own home
    await goes(ravi, '/gate', 307, '/visitors');
    await goes(ravi, '/login', 307, '/visitors'); // already signed in
    await goes(ravi, '/', 307, '/visitors');

    await goes(guardC, '/gate', 200, null);
    await goes(guardC, '/bills', 307, '/gate');
    await goes(admin, '/admin/residents', 200, null);
    await goes(admin, '/gate', 307, '/admin');

    // a resident still waiting for approval can only see /pending
    const wait = client();
    is(await wait.post('/auth/register-resident', { societyCode: society.code, fullName: 'Wendy Waiting', email: 'wendy@test.com', phone: '9555555555', password: 'Passw0rd5', flatId: flatB101, residentType: 'family' }), 201);
    await goes(wait, '/visitors', 307, '/pending');
    await goes(wait, '/bills', 307, '/pending');
    await goes(wait, '/pending', 200, null);
    await goes(wait, '/', 307, '/pending');

    // a brand-new admin must finish 2FA setup first
    const fresh = client();
    is(await fresh.post('/auth/register-admin', { societyName: 'Pink Palms', fullName: 'Fresh Admin', email: 'fresh@test.com', phone: '9000000003', password: 'Passw0rdFresh' }), 201);
    await goes(fresh, '/admin', 307, '/setup-2fa');
    await goes(fresh, '/setup-2fa', 200, null);
    await enable2fa(fresh);
    await goes(fresh, '/setup-2fa', 307, '/admin');
    await goes(fresh, '/admin', 200, null);
  });

  await test('an expired 15-minute token is renewed silently, not treated as signed out', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const c = client();
    is(await c.post('/auth/login', { identifier: 'ravi@test.com', password: 'Passw0rd1' }), 200);
    const { sid } = jwt.decode(c.jar.at) as { sid: string };
    c.jar.at = jwt.sign({ sid, typ: 'access' }, 'test-secret', { expiresIn: -10 });
    is(await c.get('/auth/me'), 401, 'TOKEN_EXPIRED'); // the API says "expired", and the client wrapper refreshes
    const page = await c.page('/visitors');
    assert.equal(page.status, 200); // the page renders the recover screen instead of bouncing to /login
    assert.ok(page.html.includes('Loading'));
    is(await c.post('/auth/refresh'), 200);
    const me = is(await c.get('/auth/me'), 200);
    assert.equal(me.user.role, 'resident');
  });

  await test('wings with history cannot be deleted; empty ones can (with step-up)', async () => {
    is(await admin.del(`/admin/wings/${wingA}`), 409, 'IN_USE');
    const w = is(await admin.post('/admin/wings', { name: 'C', floors: 1, flatsPerFloor: 1 }), 201).wing;
    is(await admin.del(`/admin/wings/${w.id}`), 200);
  });

  await test('audit trail recorded the important actions', async () => {
    const actions = is(await admin.get('/admin/audit'), 200).logs.map((l: any) => l.action);
    for (const a of ['wing.created', 'resident.approved', 'resident.rejected', 'resident.suspended', 'guard.created', 'bills.generated', '2fa.enabled']) {
      assert.ok(actions.includes(a), `missing audit entry: ${a}`);
    }
  });


  console.log(`\n${passed} checks passed\n`);
  shutdown(0);
}

main().catch((e) => {
  console.error(e);
  shutdown(1);
});
