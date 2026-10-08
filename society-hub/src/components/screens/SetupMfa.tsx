'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { useAuth } from '@/lib/client/auth';
import { Alert, Field, Loading } from '@/components/ui';
import { AuthShell } from './Login';

// Reused by the admin first-login screen and by residents who opt in from the Security page.
export function TwoFactorSetup({ onDone }: { onDone: () => void | Promise<void> }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // each call creates a new secret, so only ask once
    started.current = true;
    api.post<{ secret: string; otpauthUrl: string; qr: string }>('/auth/2fa/setup').then(setSetup).catch((e: Error) => setError(e.message));
  }, []);

  const enable = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setCodes((await api.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code })).recoveryCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!codes) return;
    const blob = new Blob([`Society Hub recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'society-hub-recovery-codes.txt';
    a.click();
  };

  if (codes) {
    return (
      <div className="stack">
        <Alert tone="ok">Two-factor authentication is on.</Alert>
        <p>Save these recovery codes somewhere safe. If you lose your phone, each code lets you sign in once. They are shown only now.</p>
        <div className="codes">{codes.map((c) => <span key={c}>{c}</span>)}</div>
        <div className="row">
          <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy codes</button>
          <button className="btn ghost" onClick={download}>Download as a file</button>
          <button className="btn right" onClick={onDone}>I saved them, continue</button>
        </div>
      </div>
    );
  }
  if (!setup) return error ? <Alert>{error}</Alert> : <Loading />;
  return (
    <form className="stack" onSubmit={enable}>
      <Alert>{error}</Alert>
      <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy).</li>
        <li>Scan this QR code with it.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      <div className="qr-box">
        <img src={setup.qr} alt="QR code to add Society Hub to your authenticator app" />
        <span className="muted small">Can't scan? Enter this key: <b style={{ letterSpacing: '0.08em' }}>{setup.secret}</b></span>
      </div>
      <Field label="6-digit code">
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <button className="btn lg" disabled={busy || code.length !== 6}>Turn on two-factor</button>
    </form>
  );
}

export default function SetupMfa() {
  const { user, reload } = useAuth();
  if (!user) return <Loading />;
  return (
    <AuthShell title="Protect the committee account." lead="Admins can approve residents and change bills, so a password alone is not enough. Two-factor is required before you continue.">
      <h2>Set up two-factor authentication</h2>
      {user.society.code && (
        <Alert tone="info">Your society code is <b>{user.society.code}</b>. Share it with residents so they can sign up. You can find it again on the Overview page.</Alert>
      )}
      <TwoFactorSetup onDone={async () => { await reload(); /* the server page now sees 2FA on and sends the admin to the dashboard */ }} />
    </AuthShell>
  );
}
