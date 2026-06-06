import type { SessionUser } from "../types";

declare const __APP_MODE__: "web" | "electron";

const isWeb = __APP_MODE__ === "web";

async function webApi<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
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
    isWeb
      ? webApi<{ user: SessionUser }>("/api/auth/login", "POST", {
          email: identifier,
          password,
        }).then((r) => r.user)
      : window.auth.login(identifier, password),

  logout: (): Promise<void> =>
    isWeb
      ? webApi<{ ok: true }>("/api/auth/logout", "POST").then(() => undefined)
      : window.auth.logout(),

  status: (): Promise<SessionUser | null> =>
    isWeb
      ? webApi<{ user: SessionUser | null }>("/api/auth/me", "GET").then((r) => r.user)
      : window.auth.status(),
};
