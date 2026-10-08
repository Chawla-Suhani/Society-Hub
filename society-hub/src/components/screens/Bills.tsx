'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { useUser } from '@/lib/client/auth';
import { Alert, Badge, Empty, Field, Loading, Modal, PageHead, Plate, Status, Tabs, fmtDate, inr, monthLabel, thisMonth, useAction, useAsync } from '@/components/ui';
import type { BillDto as Bill, Defaulter, Wing } from '@/types/api';

interface BillList { bills: Bill[]; totals: { billed: number; collected: number; outstanding: number } }

export default function Bills() {
  return useUser().role === 'admin' ? <AdminBills /> : <ResidentBills />;
}

/* ---------- resident ---------- */
function ResidentBills() {
  const { data, loading, error, reload } = useAsync(() => api.get<BillList>('/bills'));
  const [run, busy] = useAction();
  const unpaid = data?.bills.filter((b) => b.status === 'UNPAID') || [];
  const due = unpaid.reduce((t, b) => t + b.amount, 0);

  return (
    <>
      <PageHead title="Maintenance bills" sub="Pay online or ask the committee to record a cash payment." />
      {!data ? <Loading error={error} /> : (
        <div className="stack" style={{ gap: 18 }}>
          <div className="figures">
            <div className={`figure ${due ? 'alert-fig' : ''}`}><b>{inr(due)}</b><span>{unpaid.length ? `${unpaid.length} unpaid ${unpaid.length === 1 ? 'bill' : 'bills'}` : 'Nothing due'}</span></div>
            <div className="figure"><b>{data.bills.filter((b) => b.status === 'PAID').length}</b><span>Paid so far</span></div>
          </div>
          <div className="panel">
            {data.bills.length ? (
              <div className="list">
                {data.bills.map((b) => (
                  <div className="item" key={b.id}>
                    <div className="grow">
                      <div className="title">{monthLabel(b.period)}</div>
                      <span className="muted small">{b.status === 'PAID' ? `Paid ${fmtDate(b.paidAt)} (${(b.method ?? '').replace('_', ' ').toLowerCase()})` : `Due ${fmtDate(b.dueDate)}`}</span>
                    </div>
                    {b.overdue && <Badge tone="red">Overdue</Badge>}
                    <Status value={b.status} />
                    <b>{inr(b.amount)}</b>
                    {b.status === 'UNPAID'
                      ? <button className="btn signal sm" disabled={busy} onClick={() => run(async () => { await api.post(`/bills/${b.id}/pay`); await reload(); }, 'Payment recorded (test mode)')}>Pay now</button>
                      : <a className="btn ghost sm" href={`/api/bills/${b.id}/receipt`} target="_blank" rel="noreferrer">Receipt</a>}
                  </div>
                ))}
              </div>
            ) : <Empty title="No bills yet">The committee has not generated bills for your flat.</Empty>}
          </div>
          <Alert tone="info">Payments here are in test mode: no real money moves. A live payment gateway plugs in at the same place.</Alert>
        </div>
      )}
    </>
  );
}

/* ---------- admin ---------- */
function AdminBills() {
  const [tab, setTab] = useState('all');
  const [period, setPeriod] = useState(thisMonth());
  const [status, setStatus] = useState('');
  const [gen, setGen] = useState(false);
  const [paying, setPaying] = useState<Bill | null>(null);
  const bills = useAsync(() => api.get<BillList>(`/bills?period=${period}${status ? `&status=${status}` : ''}`), [period, status]);
  const def = useAsync(() => api.get<{ defaulters: Defaulter[] }>('/bills/defaulters'), []);
  const [run, busy] = useAction();
  const refresh = () => { bills.reload(); def.reload(); };

  return (
    <>
      <PageHead title="Maintenance bills" sub="Generate monthly bills, record payments and chase overdue flats.">
        <button className="btn" onClick={() => setGen(true)}>Generate bills</button>
      </PageHead>
      <Tabs value={tab} onChange={setTab} items={[['all', 'All bills'], ['def', `Overdue flats${def.data?.defaulters.length ? ` (${def.data.defaulters.length})` : ''}`]]} />

      {tab === 'all' ? (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row">
            <Field label="Month"><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option>
              </select>
            </Field>
          </div>
          {bills.data && (
            <div className="figures">
              <div className="figure"><b>{inr(bills.data.totals.billed)}</b><span>Billed</span></div>
              <div className="figure"><b>{inr(bills.data.totals.collected)}</b><span>Collected</span></div>
              <div className="figure alert-fig"><b>{inr(bills.data.totals.outstanding)}</b><span>Outstanding</span></div>
            </div>
          )}
          <div className="panel table-wrap">
            {!bills.data ? <Loading error={bills.error} /> : bills.data?.bills.length ? (
              <table>
                <thead><tr><th>Flat</th><th>Month</th><th>Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {bills.data.bills.map((b) => (
                    <tr key={b.id}>
                      <td><Plate size="sm">{b.flat}</Plate></td>
                      <td>{monthLabel(b.period)}</td>
                      <td>{inr(b.amount)}</td>
                      <td>{fmtDate(b.dueDate)} {b.overdue && <Badge tone="red">Overdue</Badge>}</td>
                      <td><Status value={b.status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        {b.status === 'UNPAID'
                          ? <button className="btn ghost sm" onClick={() => setPaying(b)}>Record payment</button>
                          : <a className="btn ghost sm" href={`/api/bills/${b.id}/receipt`} target="_blank" rel="noreferrer">Receipt</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty title="No bills for this selection">Generate bills for {monthLabel(period)} to get started.</Empty>}
          </div>
        </div>
      ) : (
        <div className="panel table-wrap">
          {!def.data ? <Loading error={def.error} /> : def.data?.defaulters.length ? (
            <table>
              <thead><tr><th>Flat</th><th>Unpaid months</th><th>Amount due</th><th>Oldest due date</th></tr></thead>
              <tbody>
                {def.data.defaulters.map((d) => (
                  <tr key={d.flatId}><td><Plate size="sm">{d.flat}</Plate></td><td>{d.months}</td><td><b>{inr(d.amount)}</b></td><td>{fmtDate(d.oldestDue)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <Empty title="No overdue flats">Every bill past its due date has been paid.</Empty>}
        </div>
      )}

      {gen && <GenerateModal onClose={() => setGen(false)} onDone={() => { setGen(false); refresh(); }} />}
      {paying && (
        <PayModal bill={paying} busy={busy} onClose={() => setPaying(null)} onSubmit={(body) => run(async () => { await api.post(`/bills/${paying.id}/mark-paid`, body); setPaying(null); refresh(); }, 'Payment recorded')} />
      )}
    </>
  );
}

function GenerateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const wings = useAsync(() => api.get<{ wings: Wing[] }>('/admin/wings'));
  const next = new Date();
  const [f, setF] = useState({ period: thisMonth(), amount: 2500, dueDate: new Date(next.getFullYear(), next.getMonth(), 10).toISOString().slice(0, 10), wingId: '' });
  const [run, busy] = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api.post('/bills/generate', { ...f, wingId: f.wingId || null });
      onDone();
      return r;
    }, 'Bills generated');
  };
  return (
    <Modal title="Generate maintenance bills" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="grid2">
          <Field label="Month"><input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
          <Field label="Amount per flat (₹)"><input type="number" min="100" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid2">
          <Field label="Due date"><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label="For">
            <select value={f.wingId} onChange={(e) => setF({ ...f, wingId: e.target.value })}>
              <option value="">All wings</option>
              {wings.data?.wings.map((w) => <option key={w.id} value={w.id}>Wing {w.name}</option>)}
            </select>
          </Field>
        </div>
        <p className="muted small">Flats that already have a bill for this month are skipped, so running this twice is safe.</p>
        <button className="btn" disabled={busy}>Generate bills</button>
      </form>
    </Modal>
  );
}

function PayModal({ bill, busy, onClose, onSubmit }: { bill: Bill; busy: boolean; onClose: () => void; onSubmit: (body: { method: string; ref: string }) => void }) {
  const [method, setMethod] = useState('CASH');
  const [ref, setRef] = useState('');
  return (
    <Modal title={`Record payment for ${bill.flat}`} onClose={onClose}>
      <p className="muted">{monthLabel(bill.period)} · {inr(bill.amount)}</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ method, ref }); }}>
        <Field label="Paid by">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash</option><option value="CHEQUE">Cheque</option><option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </Field>
        <Field label="Receipt, cheque or reference number (optional)"><input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <button className="btn" disabled={busy}>Mark as paid</button>
      </form>
    </Modal>
  );
}
