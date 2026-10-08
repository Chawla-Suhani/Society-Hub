'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { startAuthentication, browserSupportsWebAuthn, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api } from '@/lib/client/api';
import { useAuth } from '@/lib/client/auth';
import { landingFor } from '@/lib/routes';
import { Alert, Field, Plate } from '@/components/ui';
import type { Me } from '@/types/api';

export function AuthShell({ title, lead, children, wide }: { title: string; lead: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="auth">
      <section className="auth-side">
        <div className="door" aria-hidden="true">
          {['A-101', 'A-102', 'B-203', 'C-304'].map((l) => <Plate key={l} size="lg">{l}</Plate>)}
        </div>
        <div>
          <h1>{title}</h1>
          <p>{lead}</p>
        </div>
        <span className="small" style={{ color: '#7f93a1' }}>Society Hub · visitors, bills, complaints and notices in one place</span>
      </section>
      <section className="auth-main">
        <div className={`auth-form ${wide ? 'wide' : ''}`}>{children}</div>
      </section>
    </div>
  );
}

export default function Login() {
  const { enter } = useAuth();
  const signedIn = (u: Me) => enter(u, landingFor(u));
  const [mode, setMode] = useState<'member' | 'guard'>('member');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [mfa, setMfa] = useState<{ token: string } | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const attempt = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitMember = (e: FormEvent) => {
    e.preventDefault();
    attempt(async () => {
      const d = await api.post<{ mfaRequired?: boolean; mfaToken: string; user: Me }>('/auth/login', { identifier, password });
      if (d.mfaRequired) setMfa({ token: d.mfaToken });
      else signedIn(d.user);
    });
  };

  const submitMfa = (e: FormEvent) => {
    e.preventDefault();
    if (!mfa) return;
    attempt(async () => {
      const body = useRecovery ? { mfaToken: mfa.token, recoveryCode: code } : { mfaToken: mfa.token, code };
      const d = await api.post<{ user: Me }>('/auth/login/mfa', body);
      signedIn(d.user);
    });
  };

  const submitGuard = (e: FormEvent) => {
    e.preventDefault();
    attempt(async () => signedIn((await api.post<{ user: Me }>('/auth/login-guard', { phone, pin })).user));
  };

  const passkeyLogin = () =>
    attempt(async () => {
      const { options, challengeId } = await api.post<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>('/auth/passkey/login/options', { identifier: identifier || undefined });
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options });
      } catch (e) {
        if (e instanceof Error && e.name === 'NotAllowedError') throw new Error('Passkey sign-in was cancelled');
        throw e;
      }
      signedIn((await api.post<{ user: Me }>('/auth/passkey/login/verify', { challengeId, response })).user);
    });

  if (mfa) {
    return (
      <AuthShell title="One more step." lead="Open your authenticator app and enter the code for Society Hub.">
        <h2>Two-factor check</h2>
        <form className="stack" onSubmit={submitMfa}>
          <Alert>{error}</Alert>
          {useRecovery ? (
            <Field label="Recovery code" hint="Each recovery code works once.">
              <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            </Field>
          ) : (
            <Field label="6-digit code">
              <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
          )}
          <button className="btn lg" disabled={busy || !code}>Verify and sign in</button>
          <button type="button" className="btn ghost" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}>
            {useRecovery ? 'Use authenticator code' : 'Use a recovery code instead'}
          </button>
          <button type="button" className="btn ghost" onClick={() => { setMfa(null); setCode(''); setError(''); }}>Back</button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Welcome back to your society." lead="Pre-approve visitors, pay maintenance, raise a complaint or read the latest notice.">
      <div className="seg" role="group" aria-label="Sign in as">
        <button aria-pressed={mode === 'member'} onClick={() => { setMode('member'); setError(''); }}>Resident or admin</button>
        <button aria-pressed={mode === 'guard'} onClick={() => { setMode('guard'); setError(''); }}>Guard</button>
      </div>
      <Alert>{error}</Alert>

      {mode === 'member' ? (
        <form className="stack" onSubmit={submitMember}>
          <Field label="Email or mobile number">
            <input autoFocus autoComplete="username webauthn" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          </Field>
          <Field label="Password">
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="btn lg" disabled={busy || !identifier || !password}>Sign in</button>
          {browserSupportsWebAuthn() && (
            <button type="button" className="btn ghost lg" disabled={busy} onClick={passkeyLogin}>Sign in with a passkey</button>
          )}
          <p className="muted small">New here? <Link href="/signup/resident">Join your society as a resident</Link> or <Link href="/signup/admin">register a society</Link>.</p>
        </form>
      ) : (
        <form className="stack" onSubmit={submitGuard}>
          <Field label="Mobile number">
            <input autoFocus inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="6-digit PIN" hint="Your society admin created this account and PIN for you.">
            <input type="password" inputMode="numeric" maxLength={6} autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <button className="btn lg" disabled={busy || phone.length !== 10 || pin.length !== 6}>Open the gate screen</button>
        </form>
      )}
    </AuthShell>
  );
}
