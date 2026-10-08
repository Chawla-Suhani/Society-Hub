'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { useUser } from '@/lib/client/auth';
import { Alert, Empty, Field, Loading, Modal, PageHead, Plate, Status, Tabs, fmtDateTime, useAction, useAsync } from '@/components/ui';
import type { CommentDto as Comment, ComplaintDto as Complaint } from '@/types/api';

const CATEGORIES = ['Plumbing', 'Electrical', 'Lift', 'Parking', 'Security', 'Cleaning', 'Noise', 'Other'];

export default function Complaints() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const [tab, setTab] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.get<{ complaints: Complaint[] }>(`/complaints${tab ? `?status=${tab}` : ''}`), [tab]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<number | null>(null);

  return (
    <>
      <PageHead title="Complaints" sub={isAdmin ? 'Everything residents have raised. Update the status as you work on it.' : 'Report a problem and follow its progress.'}>
        {!isAdmin && <button className="btn" onClick={() => setOpen(true)}>Raise a complaint</button>}
      </PageHead>
      <Tabs value={tab} onChange={setTab} items={[['', 'All'], ['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['RESOLVED', 'Resolved']]} />
      <div className="panel">
        {!data ? <Loading error={error} /> : data.complaints.length ? (
          <div className="list">
            {data.complaints.map((c) => (
              <button key={c.id} className="item" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', cursor: 'pointer' }} onClick={() => setView(c.id)}>
                {c.flat && <Plate size="sm">{c.flat}</Plate>}
                <div className="grow">
                  <div className="title">{c.title}</div>
                  <span className="muted small">{c.category} · {isAdmin ? `${c.raisedBy} · ` : ''}{fmtDateTime(c.createdAt)}{c.assignedTo ? ` · ${c.assignedTo}` : ''}</span>
                </div>
                <Status value={c.status} />
              </button>
            ))}
          </div>
        ) : <Empty title="Nothing here">{isAdmin ? 'No complaints in this view.' : 'Raise a complaint when something needs fixing.'}</Empty>}
      </div>
      {open && <NewComplaint onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />}
      {view && <Detail id={view} isAdmin={isAdmin} onClose={() => { setView(null); reload(); }} />}
    </>
  );
}

function NewComplaint({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ category: 'Plumbing', title: '', description: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [run, busy] = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.set(k, String(v)));
    if (photo) fd.set('photo', photo);
    run(async () => { await api.form('/complaints', fd); onDone(); }, 'Complaint sent to the committee');
  };
  return (
    <Modal title="Raise a complaint" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="What is it about?">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Short title"><input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Water leaking from the ceiling" /></Field>
        <Field label="Details (optional)"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Field>
        <Field label="Photo (optional)" hint="JPG, PNG or WebP, up to 3 MB.">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </Field>
        <button className="btn" disabled={busy || f.title.trim().length < 4}>Send complaint</button>
      </form>
    </Modal>
  );
}

function Detail({ id, isAdmin, onClose }: { id: number; isAdmin: boolean; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync(() => api.get<{ complaint: Complaint; comments: Comment[] }>(`/complaints/${id}`), [id]);
  const [text, setText] = useState('');
  const [assigned, setAssigned] = useState<string | null>(null);
  const [run, busy] = useAction();
  const c = data?.complaint;

  return (
    <Modal wide title={c ? c.title : 'Complaint'} onClose={onClose}>
      {loading || !c ? <Loading /> : (
        <>
          <div className="row">
            {c.flat && <Plate size="sm">{c.flat}</Plate>}
            <Status value={c.status} />
            <span className="muted small">{c.category} · {c.raisedBy} · {fmtDateTime(c.createdAt)}</span>
          </div>
          {c.description && <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>}
          {c.hasPhoto && <img className="photo" src={`/api/complaints/${c.id}/photo`} alt="Photo attached to the complaint" />}
          {isAdmin && (
            <div className="panel-body panel row" style={{ background: 'var(--paper)' }}>
              <Field label="Status">
                <select value={c.status} onChange={(e) => run(async () => { await api.patch(`/complaints/${c.id}`, { status: e.target.value }); await reload(); })}>
                  <option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option>
                </select>
              </Field>
              <div className="grow">
                <Field label="Being handled by">
                  <input value={assigned ?? c.assignedTo ?? ''} onChange={(e) => setAssigned(e.target.value)} onBlur={() => assigned !== null && assigned !== (c.assignedTo ?? '') && run(async () => { await api.patch(`/complaints/${c.id}`, { assignedTo: assigned }); await reload(); }, 'Saved')} placeholder="Plumber, electrician, committee member…" />
                </Field>
              </div>
            </div>
          )}
          <h3>Updates</h3>
          <div className="stack" style={{ gap: 8 }}>
            {data.comments.length === 0 && <span className="muted small">No updates yet.</span>}
            {data.comments.map((m) => (
              <div key={m.id} className={`bubble ${m.authorRole === 'admin' ? 'admin' : ''}`}>
                <small>{m.author}{m.authorRole === 'admin' ? ' (committee)' : ''} · {fmtDateTime(m.createdAt)}</small>
                {m.body}
              </div>
            ))}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post(`/complaints/${c.id}/comments`, { body: text }); setText(''); await reload(); }); }}>
            <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write an update" maxLength={500} />
            <button className="btn" disabled={busy || !text.trim()}>Send</button>
          </form>
        </>
      )}
    </Modal>
  );
}
