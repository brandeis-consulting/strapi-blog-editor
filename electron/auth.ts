import { app, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs";

const STORE_FILE = "session.bin";

export interface SessionUser {
  id: number;
  email: string;
  firstname: string | null;
  lastname: string | null;
  username: string | null;
}

interface SessionData {
  jwt: string;
  user: SessionUser;
}

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

/**
 * Manages JWT sessions against Strapi's admin login (/admin/login).
 * The JWT is persisted to disk via Electron's safeStorage (Windows DPAPI etc.),
 * so only this OS user on this machine can decrypt it.
 */
export class AuthService {
  private session: SessionData | null = null;
  private readonly storePath: string;

  constructor(private readonly strapiUrl: string) {
    this.storePath = path.join(app.getPath("userData"), STORE_FILE);
    this.session = this.loadFromDisk();
  }

  private loadFromDisk(): SessionData | null {
    if (!fs.existsSync(this.storePath)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const encrypted = fs.readFileSync(this.storePath);
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted) as SessionData;
    } catch {
      return null;
    }
  }

  private saveToDisk(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "OS-encrypted storage is not available — cannot persist credentials.",
      );
    }
    if (!this.session) {
      try {
        fs.unlinkSync(this.storePath);
      } catch {
        /* not present, ignore */
      }
      return;
    }
    const buf = safeStorage.encryptString(JSON.stringify(this.session));
    fs.writeFileSync(this.storePath, buf);
  }

  async login(email: string, password: string): Promise<SessionUser> {
    const res = await fetch(`${this.strapiUrl}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(body?.error?.message ?? `Anmeldung fehlgeschlagen (${res.status})`);
    }
    const data = (await res.json()) as AdminLoginResponse;
    const u = data.data.user;
    this.session = {
      jwt: data.data.token,
      user: {
        id: u.id,
        email: u.email,
        firstname: u.firstname ?? null,
        lastname: u.lastname ?? null,
        username: u.username ?? null,
      },
    };
    this.saveToDisk();
    return this.session.user;
  }

  logout(): void {
    this.session = null;
    this.saveToDisk();
  }

  getJwt(): string | null {
    return this.session?.jwt ?? null;
  }

  getUser(): SessionUser | null {
    return this.session?.user ?? null;
  }

  /**
   * Verifies the stored JWT against /admin/users/me. If the server rejects it,
   * the local session is cleared.
   */
  async verify(): Promise<SessionUser | null> {
    if (!this.session) return null;
    try {
      const res = await fetch(`${this.strapiUrl}/admin/users/me`, {
        headers: { Authorization: `Bearer ${this.session.jwt}` },
      });
      if (res.status === 401 || res.status === 403) {
        this.logout();
        return null;
      }
      return this.session.user;
    } catch {
      return this.session.user;
    }
  }
}
