'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { Alert, Empty, Field, Loading, Modal, PageHead, Status, Tabs, fmtDateTime, fmtTime, useAction, useAsync } from '@/components/ui';
import type { VisitorPassDto as VisitorPass } from '@/types/api';

export default function Visitors() {
  const [tab, setTab] = useState('expected');
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<{ pass: VisitorPass; code: string; qr: string } | null>(null);
  const [run, busy] = useAction();
  // Poll so a walk-in request from the gate appears within seconds.
  const awaiting = useAsync(() => api.get<{ passes: VisitorPass[] }>('/visitors?scope=awaiting'), [], { poll: 8000 });
  const list = useAsync(() => api.get<{ passes: VisitorPass[] }>(`/visitors?scope=${tab}`), [tab], { poll: 15000 });
  const refresh = () => { awaiting.reload(); list.reload(); };

  const showQr = async (p: VisitorPass) => setQr({ pass: p, ...(await api.get<{ code: string; qr: string }>(`/visitors/passes/${p.id}/qr`)) });

  return (
    <>
      <PageHead title="Visitors" sub="Pre-approve guests with a QR pass, or answer when the gate calls.">
        <button className="btn" onClick={() => setOpen(true)}>Create a visitor pass</button>
      </PageHead>

      {awaiting.data && awaiting.data.passes.length > 0 && (
        <section className="panel" style={{ marginBottom: 20, borderColor: '#e2c27a' }}>
          <div className="panel-head" style={{ background: 'var(--amber-bg)' }}><h2>At the gate right now</h2></div>
          <div className="list">
            {awaiting.data.passes.map((p) => (
              <div className="item" key={p.id}>
                <div className="grow">
                  <div className="title">{p.visitorName}</div>
                  <span className="muted small">{p.purpose || 'No purpose given'} · arrived {fmtTime(p.createdAt)}</span>
                </div>
                <button className="btn signal sm" disabled={busy} onClick={() => run(async () => { await api.post(`/visitors/passes/${p.id}/decision`, { approve: true }); refresh(); }, 'Visitor approved')}>Let them in</button>
                <button className="btn danger sm" disabled={busy} onClick={() => run(async () => { await api.post(`/visitors/passes/${p.id}/decision`, { approve: false }); refresh(); }, 'Visitor declined')}>Decline</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Tabs value={tab} onChange={setTab} items={[['expected', 'Expected'], ['inside', 'Inside now'], ['recent', 'History']]} />
      <div className="panel">
        {!list.data ? <Loading error={list.error} /> : list.data.passes.length ? (
          <div className="list">
            {list.data.passes.map((p) => (
              <div className="item" key={p.id}>
                <div className="grow">
                  <div className="title">{p.visitorName}</div>
                  <span className="muted small">
                    {p.purpose ? `${p.purpose} · ` : ''}
                    {p.status === 'APPROVED' ? `valid until ${fmtDateTime(p.expiresAt)}` : p.checkedInAt ? `in ${fmtTime(p.checkedInAt)}${p.checkedOutAt ? `, out ${fmtTime(p.checkedOutAt)}` : ''}` : fmtDateTime(p.createdAt)}
                  </span>
                </div>
                <Status value={p.status} />
                {p.status === 'APPROVED' && (
                  <>
                    <button className="btn ghost sm" onClick={() => showQr(p)}>Show QR</button>
                    <button className="btn danger sm" onClick={() => run(async () => { await api.post(`/visitors/passes/${p.id}/cancel`); refresh(); }, 'Pass cancelled')}>Cancel</button>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : <Empty title="Nobody here">{tab === 'expected' ? 'Create a pass and share the QR with your guest.' : 'Nothing to show.'}</Empty>}
      </div>

      {open && <NewPass onClose={() => setOpen(false)} onCreated={(p) => { setOpen(false); refresh(); showQr(p); }} />}
      {qr && (
        <Modal title={`Pass for ${qr.pass.visitorName}`} onClose={() => setQr(null)}>
          <div className="qr-box">
            <img src={qr.qr} alt={`QR code for visitor pass ${qr.code}`} />
            <span className="code">{qr.code}</span>
            <span className="muted small">Valid until {fmtDateTime(qr.pass.expiresAt)}. Works once.</span>
          </div>
          <p className="muted small">Send the QR image or the code to your guest. The guard scans the QR or types the code at the gate.</p>
          <div className="row">
            <button className="btn ghost" onClick={() => navigator.share ? navigator.share({ title: 'Visitor pass', text: `Your visitor pass code: ${qr.code}` }).catch(() => {}) : navigator.clipboard?.writeText(qr.code)}>Share code</button>
            <button className="btn right" onClick={() => setQr(null)}>Done</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function NewPass({ onClose, onCreated }: { onClose: () => void; onCreated: (p: VisitorPass) => void }) {
  const [f, setF] = useState({ visitorName: '', visitorPhone: '', purpose: '', validHours: 12 });
  const [error, setError] = useState('');
  const [run, busy] = useAction();
  return (
    <Modal title="Create a visitor pass" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); setError(''); run(async () => onCreated((await api.post<{ pass: VisitorPass }>('/visitors/passes', f)).pass)); }}>
        <Alert>{error}</Alert>
        <Field label="Visitor name"><input autoFocus value={f.visitorName} onChange={(e) => setF({ ...f, visitorName: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="Mobile (optional)"><input inputMode="numeric" maxLength={10} value={f.visitorPhone} onChange={(e) => setF({ ...f, visitorPhone: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Purpose (optional)"><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="Delivery, guest, repair" /></Field>
        </div>
        <Field label="Valid for">
          <select value={f.validHours} onChange={(e) => setF({ ...f, validHours: Number(e.target.value) })}>
            <option value={2}>2 hours</option><option value={6}>6 hours</option><option value={12}>12 hours</option><option value={24}>1 day</option><option value={72}>3 days</option>
          </select>
        </Field>
        <button className="btn" disabled={busy || f.visitorName.trim().length < 2}>Create pass</button>
      </form>
    </Modal>
  );
}
