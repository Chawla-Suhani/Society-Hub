# Society Hub

A multi-role society management app. Residents pre-approve visitors with QR passes, pay maintenance and raise complaints. Guards run the gate from a phone. The committee admin approves residents, manages wings and flats, bills and notices.

**Roles:** admin · resident · guard  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Prisma 7 · SQLite (local) or PostgreSQL · Zod · WebAuthn passkeys · TOTP 2FA

One Next.js app does everything: the pages, and the API under `src/app/api`.

## Run it in VS Code

You need **Node.js 22 or newer** (`node -v`). No Python or C++ build tools are needed (`.npmrc` skips native builds, because the SQLite driver ships ready-made binaries).

1. Unzip the project and open the folder in VS Code (`File → Open Folder`). The folder you open must contain `package.json`.
2. Open the terminal and run:

```bash
npm install     # installs dependencies
npm run setup   # generates the Prisma client, creates the SQLite database and loads demo data
npm run dev     # http://localhost:3000
```

3. Open **http://localhost:3000**. Use `localhost`, not `127.0.0.1`, because passkeys are tied to the hostname.

`npm run setup` runs `prisma migrate dev --name init`, which creates `prisma/migrations/` and the file `dev.db`. Commit the `migrations` folder to git. To start over, delete `dev.db` and `prisma/migrations`, then run `npm run setup` again.

No `.env` file is needed locally. Copy `.env.example` to `.env` only to change secrets, ports or the database.

### Demo accounts (password for everyone: `Demo@1234`)

| Role | Sign in with | Notes |
|---|---|---|
| Admin | `admin@demo.test` | Asked to set up 2FA on first login. Scan the QR with an authenticator app. |
| Resident | `resident@demo.test` | Flat A-101, approved |
| Guard | `9000000011` + PIN `123456` | Use the "Guard" tab on the login page |

Society code is `DEMO-2026`. Three residents are waiting for approval, so you can try the approval flow straight away.

### Try the whole flow in 5 minutes

1. Sign in as admin, set up 2FA, open **Residents** and approve a pending request.
2. In a private window, open `/signup/resident`, enter `DEMO-2026`, pick wing and flat, send the request. You land on the waiting screen.
3. Approve that request as admin. The waiting screen unlocks by itself within a few seconds.
4. As the resident, create a **visitor pass** and show the QR.
5. As the guard (phone or another window), type the pass code, check it in, then try the same code again: it is refused.
6. As the guard, log a **walk-in visitor**. The resident gets a "visitor at the gate" request and approves it.

## Features

- **Society → wings → flats.** Add a wing with floors × flats per floor and flats like `A-101` are generated. Notices and bills can target one wing.
- **Sign-up and approval.** Admin and resident sign up on their own. A resident picks the society (by code), wing and flat, then stays `PENDING` until the admin approves. Statuses: `PENDING`, `ACTIVE`, `REJECTED` (with a reason and re-apply), `SUSPENDED`.
- **Guards** are created only by the admin (mobile + 6-digit PIN). Disabling a guard ends their sessions immediately.
- **Visitors.** QR passes with expiry that work once, walk-in requests the resident approves or declines, check-in and check-out, "who is inside" list.
- **Maintenance bills.** Monthly generation per society or wing (safe to run twice), pay online in test mode, admin records cash or cheque, PDF receipts, overdue flags and a defaulters list.
- **Complaints** with category, photo, status flow (Open → In progress → Resolved), assignee and a comment thread.
- **Notices** for the whole society or one wing, with pinning.
- **Audit log** of every important admin action.

## How login works

One login page, and the **database decides the role**. Nothing the browser sends can make a user an admin.

| Role | Primary sign-in | Extra protection |
|---|---|---|
| Admin | Email/mobile + password, or passkey | **TOTP 2FA is mandatory.** The API refuses every admin feature until it is on. |
| Resident | Email/mobile + password, or passkey | Optional TOTP. Cannot use any feature until approved. |
| Guard | Mobile + PIN | Admin can disable the account or reset the PIN. |

- **Passkeys (WebAuthn)** via SimpleWebAuthn. A passkey sign-in skips the 6-digit code because the passkey is already two factors (device + biometric or screen lock).
- **Sessions.** A 15-minute access token and a 7-day refresh token live in `httpOnly` cookies (not readable by JavaScript, which limits XSS damage). Refresh tokens rotate on every use, and re-using an old one revokes the session, which detects a stolen token. When the 15-minute token runs out, the page silently renews it instead of logging you out.
- **Every request re-checks the session and user in the database**, so suspending a user or signing out a device takes effect at once.
- **Two layers of protection.** Server components call `gate(['admin'])` to redirect people to the right screen, and every API route is wrapped in `route({ roles: [...] })`, which enforces the role, approval status and 2FA again. The API is the real security boundary. The page gate only picks the screen.
- **Tenant isolation + ownership.** Every query is scoped by `societyId`, and by flat for residents, so one society can never see another and a resident only sees their own flat's passes, bills and complaints.
- **Step-up authentication.** Suspending a resident, disabling a guard, resetting a PIN or deleting a wing asks for a fresh authenticator code (valid for 5 minutes).
- **Brute-force protection.** 5 wrong attempts lock the account for 15 minutes, plus per-IP rate limiting on the auth endpoints.
- **Secrets at rest.** Passwords and PINs are bcrypt-hashed, TOTP secrets are AES-256-GCM encrypted, recovery codes and refresh tokens are stored only as hashes.
- **Race conditions.** Check-in and bill payment put the status check inside the `UPDATE ... WHERE status = ...` (`updateMany`), so a double scan or double click can succeed only once. The tests fire both requests at the same instant.

## Project structure

```
prisma/
  schema.prisma            All tables, enums and relations (the single source of truth)
  seed.ts                  Demo data
src/
  app/
    layout.tsx             Reads the signed-in user on the server and passes it to the client
    (public)/              login, signup/admin, signup/resident
    (app)/                 admin/*, visitors, gate, bills, complaints, notices, security (inside the sidebar)
    setup-2fa/, pending/   steps a user may still owe (2FA, admin approval)
    api/                   Route handlers: auth, admin, visitors, complaints, notices, bills, public
  components/
    screens/               The interactive screens (client components)
    Shell.tsx, ui.tsx      Sidebar / tab bar, shared components and hooks
  lib/
    http.ts                route({ roles, stepUp, limit }, handler): auth, validation, errors, cookies
    session.ts, totp.ts, crypto.ts, challenges.ts, dto.ts, passes.ts, bills.ts, complaints.ts
    server-auth.tsx        getAuth() and gate() for server components
    client/                api.ts (typed fetch, silent token refresh, 2FA step-up prompt), auth.tsx
  types/api.ts             Shapes shared by the API and the screens
test/smoke.ts              27 end-to-end checks against the real server
```

### Where TypeScript and Prisma earn their keep

- `await body(zodSchema)` returns a fully typed body, so a handler cannot read a field the schema does not define.
- Prisma types every query from `schema.prisma`, including joins and `include`. A typo in a column name fails to compile. `Role`, `UserStatus` and `PassStatus` are enums, so `'ACTIVEE'` is an error too.
- `src/types/api.ts` is the contract between API and UI, and the screens call `api.get<{ bills: BillDto[] }>('/bills')`, so both sides are checked against the same shape.

## Tests

```bash
npm test             # 27 end-to-end checks
npm run typecheck    # strict TypeScript
```

`npm test` builds a temporary SQLite database from `prisma/schema.prisma`, builds the app if needed, starts the real Next.js server on it and drives it over HTTP. It covers sign-up and approval, isolation between societies, 2FA and recovery codes, lockout, token rotation and silent renewal, QR single-use under concurrency, bills, complaints with photo upload, and the page redirects for every role.

## PostgreSQL / deploying

Change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`, install `@prisma/adapter-pg` and swap the adapter in `src/lib/db.ts` (`new PrismaPg({ connectionString })`), set `DATABASE_URL`, then run `npm run db:deploy` on the server. Also set `JWT_SECRET` and `ENC_KEY` (long random strings), `RP_ID` (your domain), `ORIGIN` (your site's URL), then `npm run build` and `npm start`. If you deploy to a serverless platform, move complaint photos to object storage first because the local `uploads/` folder will not persist.

## What is intentionally simple (good "what would you improve" answers)

- Payments are **test mode**. `src/app/api/bills/[id]/pay` is where Razorpay order creation and webhook verification would go.
- No email or SMS. Residents see approval status in the app. A notification queue (email/WhatsApp) is the next step.
- Walk-in approvals and "inside now" refresh by polling every few seconds. WebSockets or server-sent events would make them instant.
- Email and mobile ownership are not verified at sign-up. Admin approval is the control for residents. A production version would verify them and add platform-level checks on who can register a society.
- The per-IP rate limiter is in memory, so it is per server process. Use Redis if you run several instances.
- Complaint photos are stored on local disk and served only to people allowed to see that complaint.
