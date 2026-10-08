'use client';

import { useState } from 'react';
import { api, withStepUp } from '@/lib/client/api';
import { Alert, Empty, Field, Loading, Modal, PageHead, Plate, Status, Tabs, fmtDate, useAction, useAsync } from '@/components/ui';
import type { ResidentRow } from '@/types/api';

export default function Residents() {
  const [tab, setTab] = useState('PENDING');
  const { data, loading, error, reload } = useAsync(() => api.get<{ residents: ResidentRow[] }>(`/admin/residents?status=${tab}`), [tab], { poll: 20000 });
  const [rejecting, setRejecting] = useState<ResidentRow | null>(null);
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const act = (id: number, what: string, msg: string) => run(async () => { await api.post(`/admin/residents/${id}/${what}`); await reload(); }, msg);

  return (
    <>
      <PageHead title="Residents" sub="Approve new sign-ups so they can use the app." />
      <Tabs value={tab} onChange={setTab} items={[['PENDING', 'Waiting for approval'], ['ACTIVE', 'Active'], ['REJECTED', 'Rejected'], ['SUSPENDED', 'Suspended']]} />
      <div className="panel">
        {!data ? <Loading error={error} /> : data.residents.length ? (
          <div className="list">
            {data.residents.map((r) => (
              <div className="item" key={r.id} style={{ alignItems: 'flex-start' }}>
                <Plate tone={r.status === 'PENDING' ? 'pending' : ''}>{r.flat}</Plate>
                <div className="grow stack" style={{ gap: 3 }}>
                  <div className="row"><span className="title">{r.fullName}</span><Status value={r.status} /><span className="badge">{r.residentType}</span></div>
                  <span className="muted small">{r.email} · {r.phone} · requested {fmtDate(r.createdAt)}</span>
                  {r.proofNote && <span className="small">“{r.proofNote}”</span>}
                  {r.flatConflict && <Alert tone="warn">{r.flatConflict} is already the active owner of {r.flat}. Check before approving a second owner.</Alert>}
                  {r.status === 'REJECTED' && r.rejectReason && <span className="small" style={{ color: 'var(--red)' }}>Reason: {r.rejectReason}</span>}
                </div>
                <div className="row">
                  {r.status === 'PENDING' && (
                    <>
                      <button className="btn signal sm" disabled={busy} onClick={() => act(r.id, 'approve', `${r.fullName} approved`)}>Approve</button>
                      <button className="btn danger sm" onClick={() => { setRejecting(r); setReason(''); }}>Reject</button>
                    </>
                  )}
                  {r.status === 'ACTIVE' && (
                    <button className="btn danger sm" disabled={busy} onClick={() => window.confirm(`Suspend ${r.fullName}? They will be signed out immediately.`) && run(async () => { await withStepUp(() => api.post(`/admin/residents/${r.id}/suspend`)); await reload(); }, 'Resident suspended')}>Suspend</button>
                  )}
                  {r.status === 'SUSPENDED' && <button className="btn ghost sm" disabled={busy} onClick={() => act(r.id, 'reactivate', 'Resident reactivated')}>Reactivate</button>}
                </div>
              </div>
            ))}
          </div>
        ) : <Empty title="Nobody here">{tab === 'PENDING' ? 'No requests are waiting. Share your society code so residents can sign up.' : 'No residents in this list.'}</Empty>}
      </div>

      {rejecting && (
        <Modal title={`Reject ${rejecting.fullName}?`} onClose={() => setRejecting(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post(`/admin/residents/${rejecting.id}/reject`, { reason }); setRejecting(null); await reload(); }, 'Request rejected'); }}>
            <p className="muted">They will see your reason and can send the request again.</p>
            <Field label="Reason"><input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Could not verify tenancy" maxLength={200} /></Field>
            <button className="btn danger" disabled={busy || reason.trim().length < 3}>Reject request</button>
          </form>
        </Modal>
      )}
    </>
  );
}
