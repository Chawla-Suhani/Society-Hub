'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { useAuth } from '@/lib/client/auth';
import { landingFor } from '@/lib/routes';
import { Alert, Field, Plate } from '@/components/ui';
import type { Me, ResidentType, WingWithFlats } from '@/types/api';
import { AuthShell } from './Login';

const pwHint = 'At least 8 characters, with a letter and a number.';

export function SignupAdmin() {
  const { enter } = useAuth();
  const [f, setF] = useState({ societyName: '', city: '', address: '', fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api.post<{ user: Me }>('/auth/register-admin', f);
      enter(d.user, landingFor(d.user)); // admins must turn on 2FA before anything else
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell wide title="Set up your society." lead="You become the admin. Add wings, approve residents and create guard accounts. You will get a society code to share.">
      <h2>Register a society</h2>
      <form className="stack" onSubmit={submit}>
        <Alert>{error}</Alert>
        <Field label="Society name"><input autoFocus value={f.societyName} onChange={set('societyName')} /></Field>
        <div className="grid2">
          <Field label="City"><input value={f.city} onChange={set('city')} /></Field>
          <Field label="Area or address"><input value={f.address} onChange={set('address')} /></Field>
        </div>
        <Field label="Your full name"><input value={f.fullName} onChange={set('fullName')} /></Field>
        <div className="grid2">
          <Field label="Email"><input type="email" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Mobile number"><input inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <Field label="Password" hint={pwHint}><input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        <button className="btn lg" disabled={busy}>Create society and continue</button>
        <p className="muted small">Already registered? <Link href="/login">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}

export function SignupResident() {
  const { enter } = useAuth();
  const [code, setCode] = useState('');
  const [society, setSociety] = useState<{ society: { id: number; name: string; city: string | null }; wings: WingWithFlats[] } | null>(null);
  const [wingId, setWingId] = useState<number | null>(null);
  const [flatId, setFlatId] = useState<number | null>(null);
  const [f, setF] = useState<{ fullName: string; email: string; phone: string; password: string; residentType: ResidentType; proofNote: string }>({ fullName: '', email: '', phone: '', password: '', residentType: 'owner', proofNote: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const findSociety = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api.get<{ society: { id: number; name: string; city: string | null }; wings: WingWithFlats[] }>(`/public/society/${encodeURIComponent(code.trim())}`);
      setSociety(d);
      setWingId(d.wings[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!flatId) return setError('Pick your flat first.');
    setBusy(true);
    try {
      const d = await api.post<{ user: Me }>('/auth/register-resident', { ...f, societyCode: code.trim(), flatId });
      enter(d.user, landingFor(d.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const wing = society?.wings.find((w) => w.id === wingId);
  const picked = wing?.flats.find((x) => x.id === flatId);

  if (!society) {
    return (
      <AuthShell title="Find your society." lead="Ask your society committee for the society code. It looks like GRE-4K7Q.">
        <h2>Join as a resident</h2>
        <form className="stack" onSubmit={findSociety}>
          <Alert>{error}</Alert>
          <Field label="Society code"><input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GRE-4K7Q" /></Field>
          <button className="btn lg" disabled={busy || code.trim().length < 4}>Find my society</button>
          <p className="muted small">Already have an account? <Link href="/login">Sign in</Link></p>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell wide title={society.society.name} lead="Choose your wing and flat. The committee will approve your request, and then everything unlocks.">
      <h2>Tell us where you live</h2>
      {society.wings.length === 0 ? (
        <Alert tone="warn">This society has not added any wings yet. Ask the admin to add them, then try again.</Alert>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Alert>{error}</Alert>
          <div className="stack" style={{ gap: 8 }}>
            <b>Wing</b>
            <div className="seg" role="group" aria-label="Wing" style={{ flexWrap: 'wrap', alignSelf: 'flex-start' }}>
              {society.wings.map((w) => (
                <button type="button" key={w.id} aria-pressed={w.id === wingId} onClick={() => { setWingId(w.id); setFlatId(null); }}>{w.name}</button>
              ))}
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <b>Flat {picked && <Plate size="sm" tone="taken">{picked.label}</Plate>}</b>
            <div className="flat-grid">
              {wing?.flats.map((x) => (
                <button type="button" key={x.id} aria-pressed={x.id === flatId} onClick={() => setFlatId(x.id)}><Plate>{x.label}</Plate></button>
              ))}
            </div>
          </div>
          <Field label="You are a">
            <select value={f.residentType} onChange={set('residentType')}>
              <option value="owner">Owner</option>
              <option value="tenant">Tenant</option>
              <option value="family">Family member</option>
            </select>
          </Field>
          <Field label="Full name"><input value={f.fullName} onChange={set('fullName')} /></Field>
          <div className="grid2">
            <Field label="Email"><input type="email" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Mobile number"><input inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          <Field label="Anything that helps the admin verify you (optional)" hint="For example: rent agreement date, or which owner you live with.">
            <textarea value={f.proofNote} onChange={set('proofNote')} maxLength={300} />
          </Field>
          <Field label="Password" hint={pwHint}><input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
          <button className="btn lg" disabled={busy}>Send request to the committee</button>
          <button type="button" className="btn ghost" onClick={() => setSociety(null)}>Use a different society code</button>
        </form>
      )}
    </AuthShell>
  );
}
