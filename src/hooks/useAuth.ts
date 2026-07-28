import { useCallback, useEffect, useState } from "react";
import { authApi } from "../api/auth";
import type { SessionUser } from "../types";

export interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  /**
   * True when a Strapi call returned 401 while a user was logged in. The
   * AppShell stays mounted (unsaved buffers survive) and a re-login overlay
   * is shown instead of the full login screen.
   */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Called by other layers when a Strapi call returns 401. */
  invalidate: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .status()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await authApi.login(email, password);
    setUser(u);
    setSessionExpired(false);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setSessionExpired(false);
  }, []);

  const invalidate = useCallback(() => {
    // Clear the stale cookie, but keep `user` set so the AppShell (and its
    // unsaved buffers) stays mounted while the re-login overlay is shown.
    void authApi.logout();
    setSessionExpired(true);
  }, []);

  return { user, loading, sessionExpired, login, logout, invalidate };
}
