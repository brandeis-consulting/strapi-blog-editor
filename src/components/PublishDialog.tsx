import { useMemo } from "react";
import { diffLines } from "diff";
import styles from "./PublishDialog.module.scss";

export type SaveMode = "draft" | "publish";

interface Props {
  open: boolean;
  title: string;
  original: string;
  draft: string;
  saving: boolean;
  savingMode: SaveMode | null;
  error: string | null;
  overridePublishDate: boolean;
  onOverridePublishDateChange: (value: boolean) => void;
  onCancel: () => void;
  onSave: (mode: SaveMode) => void;
}

export function PublishDialog({
  open, title, original, draft, saving, savingMode, error,
  overridePublishDate, onOverridePublishDateChange, onCancel, onSave,
}: Props) {
  const parts = useMemo(
    () => (open ? diffLines(original, draft) : []),
    [open, original, draft],
  );

  if (!open) return null;

  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);
  const hasChanges = added > 0 || removed > 0;

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{hasChanges ? "Änderungen speichern" : "Veröffentlichen"}</h2>
          <p className={styles.subtitle}>{title}</p>
        </header>

        {hasChanges ? (
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
            Pflicht-Schalter von Strapi. Betrifft nur den Publish, nicht den Entwurf.
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
            disabled={saving || !hasChanges}
            title="Speichert nur den Entwurf. Die Live-Site wird nicht aktualisiert."
          >
            {saving && savingMode === "draft" ? "Speichern…" : "Nur Entwurf speichern"}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onSave("publish")}
            disabled={saving}
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
