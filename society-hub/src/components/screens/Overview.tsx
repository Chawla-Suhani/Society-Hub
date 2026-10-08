'use client';

import Link from 'next/link';
import { api } from '@/lib/client/api';
import { useUser } from '@/lib/client/auth';
import { Empty, Loading, PageHead, Plate, fmtDateTime, inr, useAsync, useToast } from '@/components/ui';
import type { AuditLogRow as AuditLog, Overview as OverviewData, ResidentRow } from '@/types/api';

const LABEL: Record<string, string> = {
  'resident.approved': 'approved resident', 'resident.rejected': 'rejected resident', 'resident.suspended': 'suspended resident',
  'resident.reactivated': 'reactivated resident', 'guard.created': 'created guard', 'guard.disabled': 'disabled guard',
  'guard.enabled': 'enabled guard', 'guard.pin_reset': 'reset guard PIN', 'wing.created': 'created wing', 'wing.deleted': 'deleted wing',
  'bills.generated': 'generated bills', 'bill.marked_paid': 'recorded a payment', 'notice.posted': 'posted notice', 'notice.deleted': 'deleted notice',
  '2fa.enabled': 'turned on 2FA', 'passkey.added': 'added a passkey',
};

export default function Overview() {
  const user = useUser();
  const toast = useToast();
  const { data, loading, error } = useAsync(() => api.get<OverviewData>('/admin/overview'), [], { poll: 30000 });
  const pending = useAsync(() => api.get<{ residents: ResidentRow[] }>('/admin/residents?status=PENDING'), [], { poll: 30000 });
  const audit = useAsync(() => api.get<{ logs: AuditLog[] }>('/admin/audit'));

  const copy = () => { navigator.clipboard?.writeText(user.society.code ?? ''); toast('Society code copied'); };

  return (
    <>
      <PageHead title={user.society.name} sub="What needs your attention today." />
      <div className="stack" style={{ gap: 22 }}>
        <div className="panel panel-body row" style={{ background: 'var(--ink)', color: '#fff', border: 0 }}>
          <div className="grow">
            <div style={{ color: '#9db0bd', fontSize: 13 }}>Society code. Residents need this to sign up.</div>
            <span className="code" style={{ color: '#fff' }}>{user.society.code}</span>
          </div>
          <button className="btn ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.35)' }} onClick={copy}>Copy code</button>
        </div>

        {!data ? <Loading error={error} /> : (
          <div className="figures">
            <div className={`figure ${data.pendingApprovals ? 'alert-fig' : ''}`}><b>{data.pendingApprovals}</b><span>Waiting for approval</span></div>
            <div className="figure"><b>{data.activeResidents}</b><span>Active residents</span></div>
            <div className={`figure ${data.openComplaints ? 'alert-fig' : ''}`}><b>{data.openComplaints}</b><span>Open complaints</span></div>
            <div className="figure"><b>{data.visitorsInside}</b><span>Visitors inside</span></div>
            <div className={`figure ${data.overdueBills ? 'alert-fig' : ''}`}><b>{inr(data.outstandingAmount)}</b><span>{data.overdueBills} overdue of {data.unpaidBills} unpaid</span></div>
          </div>
        )}

        <section className="panel">
          <div className="panel-head"><h2>Residents waiting for you</h2><Link className="right small" href="/admin/residents">Open all requests</Link></div>
          {pending.data?.residents.length ? (
            <div className="list">
              {pending.data.residents.slice(0, 5).map((r) => (
                <div className="item" key={r.id}><Plate tone="pending" size="sm">{r.flat}</Plate><div className="grow"><div className="title">{r.fullName}</div><span className="muted small">{r.residentType} · asked {fmtDateTime(r.createdAt)}</span></div></div>
              ))}
            </div>
          ) : <Empty title="All caught up">New resident requests will appear here.</Empty>}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Recent activity</h2></div>
          {audit.data?.logs.length ? (
            <div className="list">
              {audit.data.logs.slice(0, 8).map((l) => (
                <div className="item" key={l.id}><div className="grow"><b>{l.actor || 'Someone'}</b> {LABEL[l.action] || l.action}{detail(l)}</div><span className="muted small">{fmtDateTime(l.createdAt)}</span></div>
              ))}
            </div>
          ) : <Empty title="Nothing yet" />}
        </section>
      </div>
    </>
  );
}

function detail(l: AuditLog): string {
  try {
    const m = l.meta ? JSON.parse(l.meta) : null;
    const t = m?.name || m?.title || m?.period;
    return t ? ` ${t}` : '';
  } catch {
    return '';
  }
}
