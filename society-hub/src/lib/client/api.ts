// Tiny fetch wrapper: sends cookies, parses errors, refreshes the access token once on expiry,
// and asks for a 2FA code when the server says a sensitive action needs "step-up".
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing: Promise<boolean> | null = null;
async function refreshSession(): Promise<boolean> {
  refreshing ||= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

async function request<T>(method: string, url: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${url}`, { method, credentials: 'include', headers, body: payload });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.ok) return data as T;
  if (res.status === 401 && (data?.code === 'TOKEN_EXPIRED' || data?.code === 'NO_TOKEN') && retry && (await refreshSession())) {
    return request<T>(method, url, body, false);
  }
  throw new ApiError(data?.error || 'Something went wrong. Please try again.', res.status, data?.code);
}

// Pass the response type as a generic: api.get<{ bills: Bill[] }>('/bills')
export const api = {
  get: <T = unknown>(u: string) => request<T>('GET', u),
  post: <T = unknown>(u: string, b: unknown = {}) => request<T>('POST', u, b),
  patch: <T = unknown>(u: string, b: unknown = {}) => request<T>('PATCH', u, b),
  del: <T = unknown>(u: string) => request<T>('DELETE', u),
  form: <T = unknown>(u: string, f: FormData) => request<T>('POST', u, f),
};

// Step-up: the host component (in ui.tsx) registers a function that asks the user for a code.
let askCode: (() => Promise<string | null>) | null = null;
export const registerStepUp = (fn: () => Promise<string | null>): void => {
  askCode = fn;
};

export async function withStepUp<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'STEP_UP_REQUIRED' || !askCode) throw e;
    const code = await askCode();
    if (!code) throw new ApiError('Cancelled', 0, 'CANCELLED');
    await api.post('/auth/step-up', { code });
    return action();
  }
}
