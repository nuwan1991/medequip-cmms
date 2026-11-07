import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthResponse, AuthUser, LoginInput, Permission } from '@medequip/shared';
import { api, refreshSession, setAccessToken, setSessionListener } from '../lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const LAST_ORG_KEY = 'medequip.lastOrganization';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionListener((session) => setUser(session?.user ?? null));
    // Restore the session from the refresh cookie on page load.
    void refreshSession().finally(() => setLoading(false));
    return () => setSessionListener(null);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await api<AuthResponse>('/auth/login', { method: 'POST', body: input });
    setAccessToken(session.accessToken);
    setUser(session.user);
    try {
      localStorage.setItem(LAST_ORG_KEY, input.organization);
    } catch {
      // storage unavailable - only a convenience
    }
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  const can = useCallback(
    (permission: Permission) => !!user?.permissions.includes(permission),
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, setUser, can }),
    [user, loading, login, logout, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
