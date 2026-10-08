'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/client/auth';
import { StepUpHost, ToastProvider } from '@/components/ui';
import type { Me } from '@/types/api';

export default function Providers({ initialUser, children }: { initialUser: Me | null; children: ReactNode }) {
  return (
    <AuthProvider initialUser={initialUser}>
      <ToastProvider>
        {children}
        <StepUpHost />
      </ToastProvider>
    </AuthProvider>
  );
}
