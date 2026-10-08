'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The 15-minute access token ran out but the 7-day refresh cookie may still be good: renew quietly, then re-render.
export default function SessionRecover() {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).then((r) => {
      if (r.ok) router.refresh();
      else router.replace('/login');
    });
  }, [router]);
  return <div className="empty">Loading…</div>;
}
