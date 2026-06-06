import { Router } from "express";
import { COOKIE_NAME } from "../middleware/auth";

const STRAPI_URL = process.env.STRAPI_URL ?? "https://cms.brandeis.de";
const SESSION_DAYS = 30;

interface AdminLoginResponse {
  data: {
    token: string;
    user: {
      id: number;
      email: string;
      firstname?: string | null;
      lastname?: string | null;
      username?: string | null;
    };
  };
}

export const authRouter = Router();

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "E-Mail und Passwort sind erforderlich" });
    return;
  }
  try {
    const r = await fetch(`${STRAPI_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      res.status(r.status).json({
        error: body?.error?.message ?? `Anmeldung fehlgeschlagen (${r.status})`,
      });
      return;
    }
    const data = (await r.json()) as AdminLoginResponse;
    res.cookie(COOKIE_NAME, data.data.token, sessionCookieOptions());
    res.json({
      user: {
        id: data.data.user.id,
        email: data.data.user.email,
        firstname: data.data.user.firstname ?? null,
        lastname: data.data.user.lastname ?? null,
        username: data.data.user.username ?? null,
      },
    });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Unbekannter Fehler" });
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.json({ user: null });
    return;
  }
  try {
    const r = await fetch(`${STRAPI_URL}/admin/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 401 || r.status === 403) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      res.json({ user: null });
      return;
    }
    if (!r.ok) {
      res.json({ user: null });
      return;
    }
    const data = (await r.json()) as { data: AdminLoginResponse["data"]["user"] };
    res.json({
      user: {
        id: data.data.id,
        email: data.data.email,
        firstname: data.data.firstname ?? null,
        lastname: data.data.lastname ?? null,
        username: data.data.username ?? null,
      },
    });
  } catch {
    res.json({ user: null });
  }
});
