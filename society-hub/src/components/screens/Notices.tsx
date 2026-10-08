'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { useUser } from '@/lib/client/auth';
import { Badge, Empty, Field, Loading, Modal, PageHead, fmtDate, useAction, useAsync } from '@/components/ui';
import type { NoticeDto as Notice, Wing } from '@/types/api';

export default function Notices() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const { data, loading, error, reload } = useAsync(() => api.get<{ notices: Notice[] }>('/notices'));
  const wings = useAsync(() => (isAdmin ? api.get<{ wings: Wing[] }>('/admin/wings') : Promise.resolve(null)), [isAdmin]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', body: '', wingId: '', pinned: false });
  const [run, busy] = useAction();

  const post = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.post('/notices', { title: f.title, body: f.body, pinned: f.pinned, wingId: f.wingId || null });
      setOpen(false);
      setF({ title: '', body: '', wingId: '', pinned: false });
      await reload();
    }, 'Notice posted');
  };

  return (
    <>
      <PageHead title="Notices" sub="Announcements from the committee.">
        {isAdmin && <button className="btn" onClick={() => setOpen(true)}>Post a notice</button>}
      </PageHead>
      {!data ? <Loading error={error} /> : (
        <div className="panel">
          {data?.notices.length ? (
            <div className="list">
              {data.notices.map((n) => (
                <div className="item" key={n.id} style={{ alignItems: 'flex-start' }}>
                  <div className="grow stack" style={{ gap: 4 }}>
                    <div className="row">
                      <span className="title">{n.title}</span>
                      {n.pinned && <Badge tone="amber">Pinned</Badge>}
                      <Badge tone={n.wing ? 'blue' : ''}>{n.wing ? `Wing ${n.wing}` : 'Whole society'}</Badge>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
                    <span className="muted small">{n.postedBy} · {fmtDate(n.createdAt)}</span>
                  </div>
                  {isAdmin && (
                    <div className="row">
                      <button className="btn ghost sm" onClick={() => run(async () => { await api.patch(`/notices/${n.id}/pin`, { pinned: !n.pinned }); await reload(); })}>{n.pinned ? 'Unpin' : 'Pin'}</button>
                      <button className="btn danger sm" onClick={() => window.confirm('Delete this notice?') && run(async () => { await api.del(`/notices/${n.id}`); await reload(); }, 'Notice deleted')}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <Empty title="No notices yet">{isAdmin ? 'Post the first one for your residents.' : 'New announcements will show up here.'}</Empty>}
        </div>
      )}
      {open && (
        <Modal title="Post a notice" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={post}>
            <Field label="Title"><input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Message"><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={2000} /></Field>
            <Field label="Who should see it?">
              <select value={f.wingId} onChange={(e) => setF({ ...f, wingId: e.target.value })}>
                <option value="">Whole society</option>
                {wings.data?.wings.map((w) => <option key={w.id} value={w.id}>Wing {w.name} only</option>)}
              </select>
            </Field>
            <label className="row"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} style={{ width: 18, minHeight: 18 }} /> Pin to the top</label>
            <button className="btn" disabled={busy || f.title.length < 3 || f.body.length < 3}>Post notice</button>
          </form>
        </Modal>
      )}
    </>
  );
}
