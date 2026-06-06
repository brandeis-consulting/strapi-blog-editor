import { useEffect, useState, type FormEvent } from "react";
import styles from "./NewPostDialog.module.scss";

interface Props {
  open: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (title: string, slug: string) => void;
}

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", ß: "ss",
  Ä: "ae", Ö: "oe", Ü: "ue",
};

function slugify(s: string): string {
  return s
    .replace(/[äöüßÄÖÜ]/g, (m) => UMLAUT_MAP[m] ?? m)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function NewPostDialog({ open, busy, error, onCancel, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setSlug("");
      setSlugEdited(false);
    }
  }, [open]);

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(title));
  }, [title, slugEdited]);

  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;
    onCreate(title.trim(), slug.trim());
  }

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <form className={styles.dialog} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header>
          <h2>Neuer Blogpost</h2>
          <p className={styles.subtitle}>Wird als Entwurf erstellt und sofort zum Bearbeiten geöffnet.</p>
        </header>
        <label className={styles.field}>
          <span>Titel</span>
          <input
            type="text"
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            placeholder="z. B. Neue Features in ABAP 7.59"
          />
        </label>
        <label className={styles.field}>
          <span>Slug (URL-Pfad)</span>
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            disabled={busy}
            placeholder="neue-features-in-abap-759"
            pattern="[a-z0-9\-]+"
          />
          <small>Wird automatisch aus dem Titel erzeugt. Erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche.</small>
        </label>
        {error && <div className={styles.error}>{error}</div>}
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>Abbrechen</button>
          <button type="submit" className={styles.primary} disabled={busy || !title.trim() || !slug.trim()}>
            {busy ? "Erstelle…" : "Erstellen"}
          </button>
        </footer>
      </form>
    </div>
  );
}
