import type { ReactNode } from 'react';
import Shell from '@/components/Shell';

// Every page in this group is wrapped in the sidebar / tab bar. Each page runs gate() itself, because
// Next.js renders layouts and pages in parallel, so a layout alone cannot protect its children.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
