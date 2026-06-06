import type { SessionUser } from "../types";

async function api<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      throw new Error(j.error ?? `${res.status}: ${text}`);
    } catch {
      throw new Error(`${res.status}: ${text}`);
    }
  }
  return (await res.json()) as T;
}

export const authApi = {
  login: (identifier: string, password: string): Promise<SessionUser> =>
    api<{ user: SessionUser }>("/api/auth/login", "POST", {
      email: identifier,
      password,
    }).then((r) => r.user),

  logout: (): Promise<void> =>
    api<{ ok: true }>("/api/auth/logout", "POST").then(() => undefined),

  status: (): Promise<SessionUser | null> =>
    api<{ user: SessionUser | null }>("/api/auth/me", "GET").then((r) => r.user),
};
