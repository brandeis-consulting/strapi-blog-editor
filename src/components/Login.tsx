import { useState, type FormEvent } from "react";
import styles from "./Login.module.scss";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  /**
   * Overlay mode: rendered on top of the still-mounted AppShell after the
   * session expired, so unsaved buffers survive the re-login.
   */
  overlay?: boolean;
  initialEmail?: string;
}

export function Login({ onLogin, overlay = false, initialEmail }: Props) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onLogin(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={overlay ? styles.overlay : styles.screen}>
      <form className={styles.card} onSubmit={submit}>
        <h1>{overlay ? "Sitzung abgelaufen" : "Brandeis Blog Editor"}</h1>
        <p className={styles.subtitle}>
          {overlay
            ? "Bitte melde dich neu an — deine ungespeicherten Änderungen bleiben erhalten."
            : "Anmelden mit deinem Strapi-Admin-Account"}
        </p>
        <label className={styles.field}>
          <span>E-Mail</span>
          <input
            type="email"
            autoComplete="username"
            autoFocus={!initialEmail}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          <span>Passwort</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus={!!initialEmail}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        {error && <div className={styles.error}>{error}</div>}
        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? "Anmeldung läuft…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}
