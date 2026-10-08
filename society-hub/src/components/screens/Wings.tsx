'use client';

import { useState, type FormEvent } from 'react';
import { api, withStepUp } from '@/lib/client/api';
import { Alert, Empty, Field, Loading, Modal, PageHead, Plate, useAction, useAsync } from '@/components/ui';
import type { FlatWithResidents, Wing } from '@/types/api';

export default function Wings() {
  const { data, loading, error, reload } = useAsync(() => api.get<{ wings: Wing[] }>('/admin/wings'));
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [f, setF] = useState({ name: '', floors: 5, flatsPerFloor: 4 });
  const [run, busy] = useAction();

  const create = (e: FormEvent) => {
    e.preventDefault();
    run(async () => { await api.post('/admin/wings', f); setOpen(false); setF({ name: '', floors: 5, flatsPerFloor: 4 }); await reload(); }, `Wing ${f.name} created with ${f.floors * f.flatsPerFloor} flats`);
  };

  return (
    <>
      <PageHead title="Wings & flats" sub="Add each wing once and its flats are numbered for you.">
        <button className="btn" onClick={() => setOpen(true)}>Add a wing</button>
      </PageHead>
      {!data ? <Loading error={error} /> : data.wings.length ? (
        <div className="stack" style={{ gap: 14 }}>
          {data.wings.map((w) => (
            <section className="panel" key={w.id}>
              <div className="panel-head">
                <Plate size="lg">{w.name}</Plate>
                <div><div className="title">Wing {w.name}</div><span className="muted small">{w.floors} floors · {w.flatsPerFloor} flats per floor · {w.flatCount} flats · {w.residentCount} active residents</span></div>
                <button className="btn ghost sm right" onClick={() => setSel(sel === w.id ? null : w.id)}>{sel === w.id ? 'Hide flats' : 'View flats'}</button>
                <button className="btn danger sm" onClick={() => window.confirm(`Delete wing ${w.name}? This only works if it has no residents or history.`) && run(async () => { await withStepUp(() => api.del(`/admin/wings/${w.id}`)); await reload(); }, 'Wing deleted')}>Delete</button>
              </div>
              {sel === w.id && <FlatGrid wingId={w.id} />}
            </section>
          ))}
        </div>
      ) : (
        <div className="panel"><Empty title="No wings yet">Residents cannot sign up until you add at least one wing.</Empty></div>
      )}

      {open && (
        <Modal title="Add a wing" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={create}>
            <Field label="Wing name" hint="For example A, B or Tower 1."><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={20} /></Field>
            <div className="grid2">
              <Field label="Floors"><input type="number" min="1" max="60" value={f.floors} onChange={(e) => setF({ ...f, floors: Number(e.target.value) })} /></Field>
              <Field label="Flats per floor"><input type="number" min="1" max="20" value={f.flatsPerFloor} onChange={(e) => setF({ ...f, flatsPerFloor: Number(e.target.value) })} /></Field>
            </div>
            <Alert tone="info">{f.name || 'A'}-101 to {f.name || 'A'}-{f.floors}{String(f.flatsPerFloor).padStart(2, '0')} will be created: {f.floors * f.flatsPerFloor} flats.</Alert>
            <button className="btn" disabled={busy || !f.name.trim()}>Create wing and flats</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function FlatGrid({ wingId }: { wingId: number }) {
  const { data, loading, error } = useAsync(() => api.get<{ flats: FlatWithResidents[] }>(`/admin/wings/${wingId}/flats`), [wingId]);
  if (loading) return <Loading />;
  const byFloor: Record<number, FlatWithResidents[]> = {};
  data?.flats.forEach((x) => (byFloor[x.floor] ||= []).push(x));
  return (
    <div className="panel-body stack">
      <div className="row small muted"><Plate size="sm" tone="empty">A-101</Plate> vacant <Plate size="sm" tone="taken">A-101</Plate> resident <Plate size="sm" tone="pending">A-101</Plate> request pending</div>
      {Object.keys(byFloor).map(Number).sort((a, b) => b - a).map((floor) => (
        <div className="row" key={floor}>
          <span className="muted small" style={{ width: 54 }}>Floor {floor}</span>
          {byFloor[floor].map((x) => {
            const active = x.residents.filter((r) => r.status === 'ACTIVE');
            const tone = active.length ? 'taken' : x.residents.length ? 'pending' : 'empty';
            return <span key={x.id} title={x.residents.map((r) => `${r.fullName} (${r.residentType})`).join(', ') || 'Vacant'}><Plate tone={tone}>{x.label}</Plate></span>;
          })}
        </div>
      ))}
    </div>
  );
}
