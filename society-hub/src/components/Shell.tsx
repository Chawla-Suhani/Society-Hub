'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, useUser } from '@/lib/client/auth';
import { api } from '@/lib/client/api';
import { useAsync, Plate } from '@/components/ui';
import type { Overview, Role } from '@/types/api';

const NAV: Record<Role, Array<[string, string]>> = {
  admin: [['/admin', 'Overview'], ['/admin/residents', 'Residents'], ['/admin/wings', 'Wings & flats'], ['/admin/guards', 'Guards'], ['/complaints', 'Complaints'], ['/bills', 'Bills'], ['/notices', 'Notices'], ['/security', 'Security']],
  resident: [['/visitors', 'Visitors'], ['/bills', 'Bills'], ['/complaints', 'Complaints'], ['/notices', 'Notices'], ['/security', 'Security']],
  guard: [['/gate', 'Gate'], ['/notices', 'Notices']],
};

// Layouts and pages render in parallel in Next.js, so for a moment a signed-out visitor reaches this layout
// before the page's gate() has redirected them. Render nothing special for them; the redirect wins.
export default function Shell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <>{children}</>;
  return <SignedInShell>{children}</SignedInShell>;
}

function SignedInShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const { logout } = useAuth();
  const path = usePathname();
  const items = NAV[user.role];
  // Admin sees a count of residents waiting for approval next to "Residents".
  const { data } = useAsync(() => (user.role === 'admin' ? api.get<Overview>('/admin/overview') : Promise.resolve(null)), [user.role], { poll: 30000 });
  const pending = data?.pendingApprovals || 0;

  const active = (to: string): boolean => (to === '/admin' ? path === '/admin' : path === to || path.startsWith(`${to}/`));
  const links = (cls: 'rail' | 'tab') =>
    items.map(([to, label]) => (
      <Link key={to} href={to} className={active(to) ? 'active' : ''} aria-current={active(to) ? 'page' : undefined}>
        {label}
        {to === '/admin/residents' && pending > 0 && cls === 'rail' && <span className="count">{pending}</span>}
      </Link>
    ));

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <b>{user.society.name}</b>
          <span>{user.role === 'admin' ? 'Committee admin' : user.role === 'guard' ? 'Security gate' : 'Resident'}</span>
        </div>
        <nav className="nav" aria-label="Main">{links('rail')}</nav>
        <div className="who">
          <b>{user.fullName}</b>
          {user.flat && <Plate size="sm">{user.flat.label}</Plate>}
          <div><button onClick={logout}>Sign out</button></div>
        </div>
      </aside>

      <div>
        <div className="topbar">
          <b>{user.society.name}</b>
          {user.flat && <Plate size="sm">{user.flat.label}</Plate>}
          <button onClick={logout}>Sign out</button>
        </div>
        <main className="main">{children}</main>
        <nav className="tabbar" aria-label="Main">{links('tab')}</nav>
      </div>
    </div>
  );
}
