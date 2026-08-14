'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, setAccessToken, setAuthCallbacks, fetchCurrentUserSilently } from './api-client';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, timezone?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const handleAuthFailure = useCallback(() => {
    clearSession();
    router.push('/login');
  }, [clearSession, router]);

  // Registers callbacks once on mount so api-client.ts can reach back into
  // this context without a circular import - api-client stays framework-
  // agnostic (no React/Next imports), auth-context owns all React state.
  useEffect(() => {
    setAuthCallbacks({
      onTokensRefreshed: () => {
        // Access token itself is already updated inside api-client's
        // module-level state by performRefresh() - nothing to do here
        // unless a future UI needs to react to a refresh happening.
      },
      onAuthFailure: handleAuthFailure
    });
  }, [handleAuthFailure]);

  // Silent session restore on load: calling an authenticated endpoint with
  // no access token in memory yet deliberately triggers a 401, which
  // api-client's existing refresh-and-retry logic catches - it calls
  // /auth/refresh (reads the httpOnly cookie automatically via
  // credentials: 'include'), and on success retries getCurrentUser().
  // Reuses the exact same code path as any other mid-session token expiry,
  // rather than a second parallel "restore" mechanism.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const result = await fetchCurrentUserSilently();
        if (!cancelled) {
          setUser(result.user);
        }
      } catch {
        // No valid session (no cookie, or refresh token expired/revoked) -
        // this is the expected path for a first-time visitor or a fully
        // logged-out user, not an error worth surfacing to them.
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiClient.login(email, password);
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, timezone?: string) => {
      const result = await apiClient.register(email, password, name, timezone);
      setAccessToken(result.accessToken);
      setUser(result.user);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Server-side revocation failing shouldn't trap the user in a
      // logged-in-looking UI - clear local state regardless. Matches the
      // project's established "best-effort, never block the user-facing
      // action" pattern used for reminder job cancellation on delete.
    }
    clearSession();
    router.push('/login');
  }, [clearSession, router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
