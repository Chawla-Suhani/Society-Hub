'use client';

import { useState } from 'react';
import { startRegistration, browserSupportsWebAuthn, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { api } from '@/lib/client/api';
import { useAuth, useUser } from '@/lib/client/auth';
import { Alert, Badge, Empty, Field, Loading, Modal, PageHead, fmtDateTime, useAction, useAsync, useToast } from '@/components/ui';
import type { PasskeyRow, SessionRow } from '@/types/api';
import { TwoFactorSetup } from './SetupMfa';

export default function Security() {
  const user = useUser();
  const { reload } = useAuth();
  const toast = useToast();
  const passkeys = useAsync(() => api.get<{ passkeys: PasskeyRow[] }>('/auth/passkeys'));
  const sessions = useAsync(() => api.get<{ sessions: SessionRow[] }>('/auth/sessions'));
  const [run, busy] = useAction();
  const [setup2fa, setSetup2fa] = useState(false);
  const [disable, setDisable] = useState(false);
  const [dis, setDis] = useState({ password: '', code: '' });

  const addPasskey = () =>
    run(async () => {
      const options = await api.post<PublicKeyCredentialCreationOptionsJSON>('/auth/passkey/register/options');
      let response;
      try {
        response = await startRegistration({ optionsJSON: options });
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        if (name === 'InvalidStateError') throw new Error('This device already has a passkey for your account.');
        if (name === 'NotAllowedError') throw new Error('Passkey setup was cancelled.');
        throw e;
      }
      const label = /Android|iPhone|iPad/.test(navigator.userAgent) ? 'Phone passkey' : 'Computer passkey';
      await api.post('/auth/passkey/register/verify', { response, label });
      await passkeys.reload();
      await reload();
    }, 'Passkey added. You can now sign in without a password.');

  return (
    <>
      <PageHead title="Security" sub="Passkeys, two-factor and where you are signed in." />
      <div className="stack" style={{ gap: 20 }}>
        <section className="panel">
          <div className="panel-head">
            <h2>Passkeys</h2>
            {browserSupportsWebAuthn() && <button className="btn sm right" disabled={busy} onClick={addPasskey}>Add a passkey</button>}
          </div>
          {!browserSupportsWebAuthn() && <div className="panel-body"><Alert tone="warn">This browser does not support passkeys.</Alert></div>}
          {!passkeys.data ? <Loading error={passkeys.error} /> : passkeys.data?.passkeys.length ? (
            <div className="list">
              {passkeys.data.passkeys.map((p) => (
                <div className="item" key={p.id}>
                  <div className="grow"><div className="title">{p.label}</div><span className="muted small">Added {fmtDateTime(p.createdAt)}</span></div>
                  <button className="btn danger sm" onClick={() => run(async () => { await api.del(`/auth/passkeys/${p.id}`); await passkeys.reload(); await reload(); }, 'Passkey removed')}>Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No passkeys yet">Sign in with your fingerprint, face or screen lock instead of typing a password.</Empty>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Two-factor authentication</h2>
            <Badge tone={user.totpEnabled ? 'green' : 'amber'}>{user.totpEnabled ? 'On' : 'Off'}</Badge>
            {!user.totpEnabled && <button className="btn sm right" onClick={() => setSetup2fa(true)}>Turn on</button>}
            {user.totpEnabled && user.role !== 'admin' && <button className="btn danger sm right" onClick={() => setDisable(true)}>Turn off</button>}
          </div>
          <div className="panel-body muted">
            {user.role === 'admin' ? 'Required for committee admins. A code from your authenticator app is also asked before sensitive actions like suspending a resident.' : 'Adds a code from your authenticator app after your password. Optional, but recommended.'}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Signed-in devices</h2></div>
          {!sessions.data ? <Loading error={sessions.error} /> : (
            <div className="list">
              {sessions.data?.sessions.map((s) => (
                <div className="item" key={s.id}>
                  <div className="grow">
                    <div className="title">{deviceName(s.userAgent)} {s.current && <Badge tone="teal">This device</Badge>}</div>
                    <span className="muted small">Last active {fmtDateTime(s.lastUsedAt)} · {s.ip}</span>
                  </div>
                  {!s.current && <button className="btn danger sm" onClick={() => run(async () => { await api.del(`/auth/sessions/${s.id}`); await sessions.reload(); }, 'Signed out')}>Sign out</button>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {setup2fa && (
        <Modal title="Set up two-factor" onClose={() => setSetup2fa(false)}>
          <TwoFactorSetup onDone={async () => { setSetup2fa(false); await reload(); toast('Two-factor is on'); }} />
        </Modal>
      )}
      {disable && (
        <Modal title="Turn off two-factor" onClose={() => setDisable(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post('/auth/2fa/disable', dis); setDisable(false); await reload(); }, 'Two-factor is off'); }}>
            <Field label="Password"><input type="password" value={dis.password} onChange={(e) => setDis({ ...dis, password: e.target.value })} /></Field>
            <Field label="Authenticator code"><input inputMode="numeric" maxLength={6} value={dis.code} onChange={(e) => setDis({ ...dis, code: e.target.value.replace(/\D/g, '') })} /></Field>
            <button className="btn danger" disabled={busy}>Turn off two-factor</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function deviceName(ua: string | null = ''): string {
  ua = ua || '';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${br} on ${os}`;
}
