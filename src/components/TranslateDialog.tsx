import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./TranslateDialog.module.scss";

interface Props {
  open: boolean;
  busy: boolean;
  error: string | null;
  postTitle: string;
  onCancel: () => void;
  onTranslate: (apiKey: string) => void;
}

/**
 * Fragt den Anthropic-API-Key ab, bevor übersetzt wird.
 *
 * Bewusst kein Environment-Variable: eine Übersetzung kostet direkt Geld, also
 * soll sie eine bewusste Handlung bleiben. Der Key wird nicht gespeichert —
 * weder im Browser noch auf dem Server — und ist nach dem Schließen weg.
 */
export function TranslateDialog({ open, busy, error, postTitle, onCancel, onTranslate }: Props) {
  const [apiKey, setApiKey] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setApiKey("");
    else inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || busy) return;
    onTranslate(apiKey.trim());
  }

  return (
    <div className={styles.backdrop} onClick={busy ? undefined : onCancel}>
      <form className={styles.dialog} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header>
          <h2>Ins Englische übersetzen</h2>
          <p className={styles.subtitle}>
            „{postTitle}“ wird übersetzt und als <strong>unveröffentlichter englischer
            Entwurf</strong> angelegt — verknüpft mit dem Original, mit dessen Datum,
            Kategorien, Autor und Beitragsbild.
          </p>
        </header>

        <label className={styles.field}>
          <span>Anthropic API-Key</span>
          <input
            ref={inputRef}
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={busy}
            placeholder="sk-ant-…"
          />
          <small>
            Wird nur für diese eine Übersetzung verwendet und nirgends gespeichert.
            Eine Übersetzung kostet je nach Länge des Beitrags wenige Cent.
          </small>
        </label>

        {error && <div className={styles.error}>{error}</div>}

        {busy && (
          <div className={styles.progress}>
            Übersetzung läuft — das dauert bei längeren Beiträgen bis zu einer Minute.
          </div>
        )}

        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>Abbrechen</button>
          <button type="submit" className={styles.primary} disabled={busy || !apiKey.trim()}>
            {busy ? "Übersetze…" : "Übersetzen"}
          </button>
        </footer>
      </form>
    </div>
  );
}
