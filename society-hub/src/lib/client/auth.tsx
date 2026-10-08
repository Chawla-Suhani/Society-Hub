'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import type { Me } from '@/types/api';

interface AuthState {
  user: Me | null;
  setUser: (u: Me | null) => void;
  /** Re-reads the signed-in user and refreshes server components (layouts and pages). */
  reload: () => Promise<Me | null>;
  logout: () => Promise<void>;
  /** After a successful sign-in: store the user, then let the server render the right screen. */
  enter: (u: Me, to: string) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// For screens behind the server-side gate(), where a signed-in user is guaranteed.
export function useUser(): Me {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called while signed out');
  return user;
}

export function AuthProvider({ initialUser, children }: { initialUser: Me | null; children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(initialUser);

  const reload = useCallback(async (): Promise<Me | null> => {
    try {
      const d = await api.get<{ user: Me }>('/auth/me');
      setUser(d.user);
      router.refresh();
      return d.user;
    } catch {
      setUser(null);
      return null;
    }
  }, [router]);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    router.replace('/login');
    router.refresh();
  };

  const enter = (u: Me, to: string) => {
    setUser(u);
    router.replace(to);
    router.refresh();
  };

  return <Ctx.Provider value={{ user, setUser, reload, logout, enter }}>{children}</Ctx.Provider>;
}
