'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type DependencyList, type ReactNode } from 'react';
import { ApiError, registerStepUp } from '@/lib/client/api';

/* ---------- formatting ---------- */
type DateInput = string | number | Date | null | undefined;
const tz = 'Asia/Kolkata';
export const fmtDate = (v: DateInput): string => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }) : '');
export const fmtTime = (v: DateInput): string => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz }) : '');
export const fmtDateTime = (v: DateInput): string => (v ? `${fmtDate(v)}, ${fmtTime(v)}` : '');
export const inr = (n: number | null | undefined): string => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export const monthLabel = (p: string): string => new Date(`${p}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
export const thisMonth = (): string => new Date().toISOString().slice(0, 7);

/* ---------- small pieces ---------- */
export function Plate({ children, size, tone }: { children: ReactNode; size?: 'sm' | 'lg'; tone?: 'pending' | 'empty' | 'taken' | '' }) {
  return <span className={`plate ${size || ''} ${tone || ''}`}>{children}</span>;
}

export function Badge({ tone, children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone || ''}`}>{children}</span>;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'green', PENDING: 'amber', REJECTED: 'red', SUSPENDED: 'red',
  OPEN: 'amber', IN_PROGRESS: 'blue', RESOLVED: 'green',
  APPROVED: 'teal', AWAITING_APPROVAL: 'amber', CHECKED_IN: 'blue', CHECKED_OUT: '', CANCELLED: '', EXPIRED: '',
  PAID: 'green', UNPAID: 'amber',
};
const STATUS_TEXT: Record<string, string> = {
  IN_PROGRESS: 'In progress', AWAITING_APPROVAL: 'Waiting for resident', CHECKED_IN: 'Inside', CHECKED_OUT: 'Left', APPROVED: 'Expected',
  PENDING: 'Awaiting approval',
};
export function Status({ value }: { value: string }) {
  const text = STATUS_TEXT[value] || value.charAt(0) + value.slice(1).toLowerCase();
  return <Badge tone={STATUS_TONE[value]}>{text}</Badge>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'warn' | 'ok'; children?: ReactNode }) {
  return children ? <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div> : null;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export const Loading = ({ error }: { error?: string | null }) =>
  error ? <Empty title="Could not load this">{error}</Empty> : <div className="empty">Loading…</div>;

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="row right">{children}</div>
    </div>
  );
}

export function Tabs({ value, onChange, items }: { value: string; onChange: (key: string) => void; items: Array<[string, string]> }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={value === key} className={value === key ? 'on' : ''} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/* ---------- data loading ---------- */
export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList = [], { poll }: { poll?: number } = {}): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const load = useCallback(async (silent: boolean) => {
    if (!silent) setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await fnRef.current(), error: null, loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState((s) => ({ data: silent ? s.data : null, error: message, loading: false }));
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, deps);
  useEffect(() => {
    if (!poll) return;
    const t = setInterval(() => document.visibilityState === 'visible' && load(true), poll);
    return () => clearInterval(t);
  }, [poll, load]);
  return { ...state, reload: () => load(true) };
}

/* ---------- toasts ---------- */
type ToastFn = (text: string, tone?: 'error') => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = (): ToastFn => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Array<{ id: number; text: string; tone?: string }>>([]);
  const push = useCallback<ToastFn>((text, tone) => {
    const id = Math.random();
    setItems((l) => [...l, { id, text, tone }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone || ''}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- run an action with a busy flag and error toast ---------- */
export function useAction(): [<R>(fn: () => Promise<R>, okMessage?: string) => Promise<R | undefined>, boolean] {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async <R,>(fn: () => Promise<R>, okMessage?: string): Promise<R | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMessage) toast(okMessage);
      return r;
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'CANCELLED')) toast(e instanceof Error ? e.message : String(e), 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return [run, busy];
}

/* ---------- step-up dialog (asks for an authenticator code) ---------- */
export function StepUpHost() {
  const [req, setReq] = useState<{ resolve: (v: string | null) => void } | null>(null);
  const [code, setCode] = useState('');
  useEffect(() => {
    registerStepUp(() => new Promise<string | null>((resolve) => { setCode(''); setReq({ resolve }); }));
  }, []);
  if (!req) return null;
  const close = (v: string | null) => { req.resolve(v); setReq(null); };
  return (
    <Modal title="Confirm it's you" onClose={() => close(null)}>
      <p className="muted">This action needs a fresh code from your authenticator app.</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); close(code.trim()); }}>
        <Field label="6-digit code">
          <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <div className="row">
          <button className="btn" disabled={code.length !== 6}>Confirm</button>
          <button type="button" className="btn ghost" onClick={() => close(null)}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
