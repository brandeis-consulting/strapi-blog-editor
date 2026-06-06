import { useCallback, useEffect, useState } from "react";
import { authApi } from "../api/auth";
import type { SessionUser } from "../types";

export interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Called by other layers when a Strapi call returns 401. */
  invalidate: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const invalidate = useCallback(() => {
    void authApi.logout();
    setUser(null);
  }, []);

  return { user, loading, login, logout, invalidate };
}
