'use client';

import { useState } from 'react';
import { api, withStepUp } from '@/lib/client/api';
import { Empty, Field, Loading, Modal, PageHead, Status, useAction, useAsync } from '@/components/ui';
import type { GuardRow } from '@/types/api';

export default function Guards() {
  const { data, loading, error, reload } = useAsync(() => api.get<{ guards: GuardRow[] }>('/admin/guards'));
  const [add, setAdd] = useState(false);
  const [reset, setReset] = useState<GuardRow | null>(null);
  const [f, setF] = useState({ fullName: '', phone: '', pin: '' });
  const [pin, setPin] = useState('');
  const [run, busy] = useAction();
  const randomPin = () => String(Math.floor(100000 + Math.random() * 900000));

  return (
    <>
      <PageHead title="Guards" sub="Only you can create guard accounts. Guards sign in with their mobile number and a 6-digit PIN.">
        <button className="btn" onClick={() => { setF({ fullName: '', phone: '', pin: randomPin() }); setAdd(true); }}>Add a guard</button>
      </PageHead>
      <div className="panel">
        {!data ? <Loading error={error} /> : data.guards.length ? (
          <div className="list">
            {data.guards.map((g) => (
              <div className="item" key={g.id}>
                <div className="grow"><div className="title">{g.fullName}</div><span className="muted small">{g.phone} {g.signedIn && '· signed in now'}</span></div>
                <Status value={g.status} />
                {g.status === 'ACTIVE' ? (
                  <>
                    <button className="btn ghost sm" onClick={() => { setPin(randomPin()); setReset(g); }}>Reset PIN</button>
                    <button className="btn danger sm" onClick={() => window.confirm(`Disable ${g.fullName}? They will be signed out right away.`) && run(async () => { await withStepUp(() => api.post(`/admin/guards/${g.id}/disable`)); await reload(); }, 'Guard disabled')}>Disable</button>
                  </>
                ) : <button className="btn ghost sm" onClick={() => run(async () => { await api.post(`/admin/guards/${g.id}/enable`); await reload(); }, 'Guard enabled')}>Enable</button>}
              </div>
            ))}
          </div>
        ) : <Empty title="No guards yet">Add the guards who work at your gate.</Empty>}
      </div>

      {add && (
        <Modal title="Add a guard" onClose={() => setAdd(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post('/admin/guards', f); setAdd(false); await reload(); }, `Guard added. PIN: ${f.pin}`); }}>
            <Field label="Full name"><input autoFocus value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
            <Field label="Mobile number"><input inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="6-digit PIN" hint="Tell the guard this PIN in person. You can reset it any time."><input inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></Field>
            <button className="btn" disabled={busy || f.fullName.trim().length < 2 || f.phone.length !== 10 || f.pin.length !== 6}>Create guard account</button>
          </form>
        </Modal>
      )}
      {reset && (
        <Modal title={`Reset PIN for ${reset.fullName}`} onClose={() => setReset(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await withStepUp(() => api.post(`/admin/guards/${reset.id}/reset-pin`, { pin })); setReset(null); await reload(); }, `New PIN: ${pin}`); }}>
            <Field label="New 6-digit PIN" hint="The guard is signed out on every device when you change it."><input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></Field>
            <button className="btn" disabled={busy || pin.length !== 6}>Save new PIN</button>
          </form>
        </Modal>
      )}
    </>
  );
}
