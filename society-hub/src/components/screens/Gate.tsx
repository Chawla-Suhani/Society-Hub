'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { Alert, Empty, Field, Loading, PageHead, Plate, Status, fmtTime, useAction, useAsync } from '@/components/ui';
import type { VisitorPassDto as VisitorPass } from '@/types/api';

interface VerifyResult { pass: VisitorPass; canCheckIn: boolean; reason: string | null }

// The guard's whole job on one phone screen: scan, verify, let in, log walk-ins, see who is inside.
export default function Gate() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [run, busy] = useAction();
  const inside = useAsync(() => api.get<{ passes: VisitorPass[] }>('/visitors?scope=inside'), [], { poll: 10000 });
  const waiting = useAsync(() => api.get<{ passes: VisitorPass[] }>('/visitors?scope=awaiting'), [], { poll: 6000 });
  const expected = useAsync(() => api.get<{ passes: VisitorPass[] }>('/visitors?scope=expected'), [], { poll: 20000 });
  const flats = useAsync(() => api.get<{ flats: Array<{ id: number; label: string; wing: string }> }>('/visitors/flats'));
  const refresh = () => { inside.reload(); waiting.reload(); expected.reload(); };

  const verify = async (value: string) => {
    setError('');
    setResult(null);
    try {
      setResult(await api.post<VerifyResult>('/visitors/verify', { code: value }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const checkIn = (p: VisitorPass) =>
    run(async () => {
      await api.post('/visitors/check-in', { passId: p.id });
      setResult(null);
      setCode('');
      refresh();
    }, `${p.visitorName} is inside`);

  return (
    <>
      <PageHead title="Gate" sub="Scan the visitor's QR or type the code." />
      <div className="stack" style={{ gap: 20 }}>
        <section className="panel">
          <div className="panel-body stack">
            <form className="row" onSubmit={(e) => { e.preventDefault(); code.trim() && verify(code.trim()); }}>
              <input className="grow" style={{ fontFamily: 'var(--font-plate)', fontSize: 22, letterSpacing: '0.18em', textTransform: 'uppercase' }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PASS CODE" maxLength={8} autoComplete="off" aria-label="Pass code" />
              <button className="btn signal lg" disabled={code.trim().length < 6}>Check</button>
              <button type="button" className="btn ghost lg" onClick={() => setScanning(!scanning)}>{scanning ? 'Close camera' : 'Scan QR'}</button>
            </form>
            {scanning && <Scanner onCode={(c) => { setScanning(false); setCode(c); verify(c); }} />}
            <Alert>{error}</Alert>
            {result && (
              <div className={`scan-result ${result.canCheckIn ? 'ok' : 'bad'}`}>
                <div className="row">
                  <Plate size="lg">{result.pass.flat}</Plate>
                  <div className="grow">
                    <b style={{ fontSize: 20 }}>{result.pass.visitorName}</b>
                    <div className="muted small">{result.pass.purpose || 'No purpose given'} · invited by {result.pass.createdByName}</div>
                  </div>
                  <Status value={result.pass.status} />
                </div>
                {result.canCheckIn ? (
                  <button className="btn signal lg block" disabled={busy} onClick={() => checkIn(result.pass)}>Let {result.pass.visitorName.split(' ')[0]} in</button>
                ) : <Alert>{result.reason}</Alert>}
              </div>
            )}
          </div>
        </section>

        {waiting.data && waiting.data.passes.length > 0 && (
          <section className="panel" style={{ borderColor: '#e2c27a' }}>
            <div className="panel-head" style={{ background: 'var(--amber-bg)' }}><h2>Waiting for a resident to answer</h2></div>
            <div className="list">
              {waiting.data.passes.map((p) => (
                <div className="item" key={p.id}><Plate size="sm" tone="pending">{p.flat}</Plate><div className="grow"><div className="title">{p.visitorName}</div><span className="muted small">Asked at {fmtTime(p.createdAt)}</span></div><span className="badge amber">Waiting…</span></div>
              ))}
            </div>
          </section>
        )}

        <WalkIn flats={flats.data?.flats || []} onDone={refresh} />

        <section className="panel">
          <div className="panel-head"><h2>Inside now</h2><span className="badge blue">{inside.data?.passes.length ?? 0}</span></div>
          {!inside.data ? <Loading error={inside.error} /> : inside.data.passes.length ? (
            <div className="list">
              {inside.data.passes.map((p) => (
                <div className="item" key={p.id}>
                  <Plate size="sm">{p.flat}</Plate>
                  <div className="grow"><div className="title">{p.visitorName}</div><span className="muted small">In at {fmtTime(p.checkedInAt)}</span></div>
                  <button className="btn ghost sm" disabled={busy} onClick={() => run(async () => { await api.post('/visitors/check-out', { passId: p.id }); refresh(); }, `${p.visitorName} checked out`)}>Check out</button>
                </div>
              ))}
            </div>
          ) : <Empty title="No visitors inside" />}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Approved and expected</h2><span className="badge teal">{expected.data?.passes.length ?? 0}</span></div>
          {expected.data?.passes.length ? (
            <div className="list">
              {expected.data.passes.map((p) => (
                <div className="item" key={p.id}>
                  <Plate size="sm">{p.flat}</Plate>
                  <div className="grow"><div className="title">{p.visitorName}</div><span className="muted small">{p.purpose || 'Visitor'}{p.source === 'walkin' ? ' · approved from the gate' : ''}</span></div>
                  <button className="btn signal sm" disabled={busy} onClick={() => checkIn(p)}>Let in</button>
                </div>
              ))}
            </div>
          ) : <Empty title="Nobody expected right now" />}
        </section>
      </div>
    </>
  );
}

function WalkIn({ flats, onDone }: { flats: Array<{ id: number; label: string; wing: string }>; onDone: () => void }) {
  const [f, setF] = useState({ visitorName: '', purpose: '', flatId: '' });
  const [run, busy] = useAction();
  return (
    <section className="panel">
      <div className="panel-head"><h2>Visitor without a pass</h2></div>
      <form className="panel-body stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post('/visitors/walkin', { ...f, flatId: Number(f.flatId) }); setF({ visitorName: '', purpose: '', flatId: '' }); onDone(); }, 'Asked the resident'); }}>
        <div className="grid3">
          <Field label="Visitor name"><input value={f.visitorName} onChange={(e) => setF({ ...f, visitorName: e.target.value })} /></Field>
          <Field label="Going to flat">
            <select value={f.flatId} onChange={(e) => setF({ ...f, flatId: e.target.value })}>
              <option value="">Select flat</option>
              {flats.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </Field>
          <Field label="Purpose"><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="Delivery, guest…" /></Field>
        </div>
        <button className="btn" disabled={busy || f.visitorName.trim().length < 2 || !f.flatId}>Ask the resident to approve</button>
      </form>
    </section>
  );
}

// Camera scanner. Loaded on demand so the main bundle stays small. Typing the code always works as a fallback.
function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCode);
  cb.current = onCode; // the camera starts once; it always calls the latest handler
  const [err, setErr] = useState('');
  useEffect(() => {
    let scanner: import('html5-qrcode').Html5Qrcode | undefined;
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        scanner = new Html5Qrcode('qr-reader');
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, (text) => {
          if (!stopped) { stopped = true; cb.current(text.trim().toUpperCase()); }
        }, undefined);
      } catch {
        setErr('Could not open the camera. Allow camera access in the browser, or type the code instead.');
      }
    })();
    return () => {
      stopped = true;
      const s = scanner;
      if (s?.isScanning) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, []);
  return (
    <>
      <div id="qr-reader" ref={ref} className="scanner" />
      <Alert tone="warn">{err}</Alert>
    </>
  );
}
