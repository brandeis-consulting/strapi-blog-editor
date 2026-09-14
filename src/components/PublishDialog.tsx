import { useMemo } from "react";
import { diffLines } from "diff";
import styles from "./PublishDialog.module.scss";

export type SaveMode = "draft" | "publish";

interface Props {
  open: boolean;
  title: string;
  original: string;
  draft: string;
  /** Geänderte Felder in Worten — der Zeilen-Diff zeigt nur den Markdown. */
  fieldChanges: string[];
  /** Verstöße, die das Speichern verhindern. Leer = alles in Ordnung. */
  blockingIssues: string[];
  saving: boolean;
  savingMode: SaveMode | null;
  error: string | null;
  overridePublishDate: boolean;
  onOverridePublishDateChange: (value: boolean) => void;
  onCancel: () => void;
  onSave: (mode: SaveMode) => void;
}

export function PublishDialog({
  open, title, original, draft, fieldChanges, blockingIssues, saving, savingMode, error,
  overridePublishDate, onOverridePublishDateChange, onCancel, onSave,
}: Props) {
  const parts = useMemo(
    () => (open ? diffLines(original, draft) : []),
    [open, original, draft],
  );

  if (!open) return null;

  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);
  const contentChanged = added > 0 || removed > 0;
  const hasChanges = contentChanged || fieldChanges.length > 0;
  const blocked = blockingIssues.length > 0;

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{hasChanges ? "Änderungen speichern" : "Veröffentlichen"}</h2>
          <p className={styles.subtitle}>{title}</p>
        </header>

        {blocked && (
          <div className={styles.blocked}>
            <strong>Speichern nicht möglich:</strong>
            <ul>
              {blockingIssues.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {fieldChanges.length > 0 && (
          <div className={styles.fieldChanges}>
            <strong>Geänderte Felder</strong>
            <ul>
              {fieldChanges.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {contentChanged ? (
          <>
            <div className={styles.stats}>
              <span className={styles.added}>+{added}</span>
              <span className={styles.removed}>−{removed}</span>
              <span className={styles.note}>Zeilen geändert</span>
            </div>
            <pre className={styles.diff}>
              {parts.map((p, i) => (
                <span
                  key={i}
                  className={
                    p.added ? styles.lineAdded : p.removed ? styles.lineRemoved : styles.lineCtx
                  }
                >
                  {(p.added ? "+ " : p.removed ? "- " : "  ") + p.value.replace(/\n$/, "")}
                  {"\n"}
                </span>
              ))}
            </pre>
          </>
        ) : (
          <div className={styles.idleHint}>
            Keine ungespeicherten Änderungen. Du kannst den aktuellen Stand veröffentlichen.
          </div>
        )}

        <div className={styles.publishDate}>
          <label htmlFor="override-publish-date">
            <input
              id="override-publish-date"
              type="checkbox"
              checked={overridePublishDate}
              onChange={(e) => onOverridePublishDateChange(e.target.checked)}
              disabled={saving}
            />
            Veröffentlichungsdatum überschreiben
          </label>
          <span className={styles.publishDateHint}>
            Pflicht-Schalter von Strapi. Dasselbe Feld wie im Feld-Editor — eine
            Änderung hier wird mitgespeichert.
          </span>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <footer>
          <button type="button" onClick={onCancel} disabled={saving}>
            Abbrechen
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => onSave("draft")}
            disabled={saving || blocked || !hasChanges}
            title="Speichert nur den Entwurf. Die Live-Site wird nicht aktualisiert."
          >
            {saving && savingMode === "draft" ? "Speichern…" : "Nur Entwurf speichern"}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onSave("publish")}
            disabled={saving || blocked}
            title="Veröffentlicht den aktuellen Stand auf der Live-Site."
          >
            {saving && savingMode === "publish"
              ? "Veröffentlichen…"
              : hasChanges
                ? "Speichern & veröffentlichen"
                : "Jetzt veröffentlichen"}
          </button>
        </footer>
      </div>
    </div>
  );
}
