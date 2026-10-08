'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { useAuth } from '@/lib/client/auth';
import { Alert, Field, Loading, Plate, useAsync, useAction } from '@/components/ui';
import type { Me, ResidentType, WingWithFlats } from '@/types/api';
import { AuthShell } from './Login';

// Shown to residents until the admin approves them. Polls so the screen unlocks by itself.
export default function Pending() {
  const { user, reload, logout } = useAuth();
  // Check again every few seconds. When the admin approves, the server layout lets the resident in.
  useAsync(() => reload(), [], { poll: user?.status === 'PENDING' ? 8000 : 0 });
  if (!user) return <Loading />;

  return (
    <AuthShell
      title={user.status === 'PENDING' ? 'Request sent.' : 'Not approved yet.'}
      lead={user.status === 'PENDING' ? 'Your society committee needs to confirm you live here. You will get in as soon as they approve.' : 'The committee could not approve your request. You can fix the details and send it again.'}
    >
      <div className="row">
        <h2>{user.society.name}</h2>
        {user.flat && <Plate tone={user.status === 'PENDING' ? 'pending' : ''}>{user.flat.label}</Plate>}
      </div>
      {user.status === 'PENDING' ? (
        <>
          <Alert tone="warn">Waiting for approval. This page checks again every few seconds, so you can leave it open.</Alert>
          <p className="muted small">Signed up as <b>{user.residentType}</b> of {user.flat?.label}. Until you are approved you cannot create visitor passes, pay bills or raise complaints.</p>
        </>
      ) : (
        <Reapply user={user} onDone={reload} />
      )}
      <button className="btn ghost" onClick={logout}>Sign out</button>
    </AuthShell>
  );
}

function Reapply({ user, onDone }: { user: Me; onDone: () => Promise<unknown> }) {
  const { data } = useAsync(() => api.get<{ wings: WingWithFlats[] }>('/auth/society-flats'));
  const [flatId, setFlatId] = useState<number>(user.flat?.id ?? 0);
  const [type, setType] = useState<ResidentType>(user.residentType || 'owner');
  const [note, setNote] = useState('');
  const [run, busy] = useAction();
  const flats = data?.wings.flatMap((w) => w.flats) || [];
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => { await api.post('/auth/resident/reapply', { flatId, residentType: type, proofNote: note }); await onDone(); }, 'Request sent again');
      }}
    >
      <Alert>{user.rejectReason ? `Reason from the committee: ${user.rejectReason}` : 'Your request was rejected.'}</Alert>
      <Field label="Your flat">
        <select value={flatId} onChange={(e) => setFlatId(Number(e.target.value))}>
          {flats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </Field>
      <Field label="You are a">
        <select value={type} onChange={(e) => setType(e.target.value as ResidentType)}>
          <option value="owner">Owner</option>
          <option value="tenant">Tenant</option>
          <option value="family">Family member</option>
        </select>
      </Field>
      <Field label="Details that help the admin verify you"><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      <button className="btn lg" disabled={busy}>Send request again</button>
    </form>
  );
}
