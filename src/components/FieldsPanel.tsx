import { useState } from "react";
import { MediaPicker } from "./MediaPicker";
import { slugify, type FieldIssue } from "../lib/postFields";
import {
  LANGUAGES,
  TEMPLATE_TYPES,
  LOCALE_BY_LANGUAGE,
  type AuthorOption,
  type CategoryOption,
  type MediaImage,
  type PostFields,
} from "../types";
import styles from "./FieldsPanel.module.scss";

interface Props {
  fields: PostFields;
  onChange: (patch: Partial<PostFields>) => void;
  categories: CategoryOption[];
  authors: AuthorOption[];
  /** Auswahllisten konnten nicht geladen werden — Felder bleiben bedienbar. */
  optionsError: string | null;
  issues: FieldIssue[];
  /** URL des aktuell gewählten Beitragsbilds, falls bekannt. */
  heroUrl: string | null;
  onHeroPick: (image: MediaImage | null) => void;
  disabled: boolean;
}

function issueFor(issues: FieldIssue[], field: string): FieldIssue | undefined {
  return issues.find((i) => i.field === field);
}

export function FieldsPanel({
  fields, onChange, categories, authors, optionsError, issues,
  heroUrl, onHeroPick, disabled,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const titleIssue = issueFor(issues, "Title");
  const slugIssue = issueFor(issues, "Slug");
  const dateIssue = issueFor(issues, "PublishDate");
  const locale = LOCALE_BY_LANGUAGE[fields.Language] ?? "de";

  function toggleCategory(documentId: string) {
    const next = fields.categoryIds.includes(documentId)
      ? fields.categoryIds.filter((id) => id !== documentId)
      : [...fields.categoryIds, documentId];
    onChange({ categoryIds: next });
  }

  function updateLink(index: number, patch: Partial<PostFields["Links"][number]>) {
    onChange({
      Links: fields.Links.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  }

  return (
    <div className={styles.panel}>
      {optionsError && (
        <div className={styles.warn}>
          Auswahllisten konnten nicht geladen werden: {optionsError}
        </div>
      )}

      <div className={styles.row}>
        <label className={styles.grow}>
          <span>
            Titel
            <em className={fields.Title.length > 256 ? styles.counterBad : styles.counter}>
              {fields.Title.length}/256
            </em>
          </span>
          <input
            type="text"
            value={fields.Title}
            onChange={(e) => onChange({ Title: e.target.value })}
            disabled={disabled}
            className={titleIssue?.blocking ? styles.bad : undefined}
          />
          {titleIssue && <small className={styles.msgBad}>{titleIssue.message}</small>}
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.grow}>
          <span>Slug</span>
          <div className={styles.inlineField}>
            <input
              type="text"
              value={fields.Slug}
              onChange={(e) => onChange({ Slug: e.target.value })}
              disabled={disabled}
              className={slugIssue?.blocking ? styles.bad : undefined}
            />
            <button
              type="button"
              onClick={() => onChange({ Slug: slugify(fields.Title) })}
              disabled={disabled || !fields.Title.trim()}
              title="Slug aus dem Titel erzeugen"
            >
              Aus Titel
            </button>
          </div>
          {slugIssue ? (
            <small className={slugIssue.blocking ? styles.msgBad : styles.msgWarn}>
              {slugIssue.message}
            </small>
          ) : (
            <small className={styles.msgHint}>/blog/{fields.Slug || "…"}</small>
          )}
        </label>
      </div>

      <div className={styles.row}>
        <label>
          <span>Sprache</span>
          <select
            value={fields.Language}
            onChange={(e) => onChange({ Language: e.target.value })}
            disabled={disabled}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Template</span>
          <select
            value={fields.TemplateType}
            onChange={(e) => onChange({ TemplateType: e.target.value })}
            disabled={disabled}
          >
            {TEMPLATE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={fields.IsCareer}
            onChange={(e) => onChange({ IsCareer: e.target.checked })}
            disabled={disabled}
          />
          <span>Karriere-Beitrag</span>
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.grow}>
          <span>Kurzbeschreibung</span>
          <textarea
            value={fields.Excerpt ?? ""}
            onChange={(e) => onChange({ Excerpt: e.target.value || null })}
            disabled={disabled}
            rows={2}
            placeholder="Teaser für Übersichtsseiten und Suchmaschinen"
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.grow}>
          <span>Autor</span>
          <select
            value={fields.authorId ?? ""}
            onChange={(e) => onChange({ authorId: e.target.value || null })}
            disabled={disabled}
          >
            <option value="">— kein Autor —</option>
            {authors.map((a) => (
              <option key={a.documentId} value={a.documentId}>
                {a.Lastname}, {a.Firstname}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.row}>
        <div className={styles.grow}>
          <span className={styles.groupLabel}>
            Kategorien
            {fields.categoryIds.length > 0 && (
              <em className={styles.counter}>{fields.categoryIds.length} gewählt</em>
            )}
          </span>
          <div className={styles.chips}>
            {categories.length === 0 && (
              <span className={styles.msgHint}>Keine Kategorien geladen.</span>
            )}
            {categories.map((c) => {
              const active = fields.categoryIds.includes(c.documentId);
              return (
                <button
                  key={c.documentId}
                  type="button"
                  className={active ? styles.chipActive : styles.chip}
                  onClick={() => toggleCategory(c.documentId)}
                  disabled={disabled}
                  title={c.Slug}
                >
                  {c.names[locale] ?? c.Name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.grow}>
          <span className={styles.groupLabel}>Beitragsbild</span>
          <div className={styles.hero}>
            {heroUrl ? (
              <img src={heroUrl} alt="" className={styles.heroThumb} />
            ) : (
              <div className={styles.heroEmpty}>kein Bild</div>
            )}
            <div className={styles.heroActions}>
              <button type="button" onClick={() => setPickerOpen(true)} disabled={disabled}>
                {heroUrl ? "Bild ersetzen" : "Bild wählen"}
              </button>
              <button
                type="button"
                onClick={() => onHeroPick(null)}
                disabled={disabled || fields.heroImageId === null}
                className={styles.danger}
              >
                Entfernen
              </button>
              <small className={styles.msgHint}>
                Ohne Bild zeigt die Site das Standard-Wallpaper.
              </small>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.row}>
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={fields.OverridePublishDate}
            onChange={(e) => onChange({ OverridePublishDate: e.target.checked })}
            disabled={disabled}
          />
          <span>Veröffentlichungsdatum überschreiben</span>
        </label>

        {/* Strapi blendet PublishDate ohne diesen Schalter aus
            (conditions.visible im Schema) — hier genauso. */}
        {fields.OverridePublishDate && (
          <label>
            <span>Datum</span>
            <input
              type="date"
              value={fields.PublishDate ?? ""}
              onChange={(e) => onChange({ PublishDate: e.target.value || null })}
              disabled={disabled}
            />
            {dateIssue && <small className={styles.msgWarn}>{dateIssue.message}</small>}
          </label>
        )}
      </div>

      <div className={styles.row}>
        <div className={styles.grow}>
          <span className={styles.groupLabel}>
            Nützliche Links
            <button
              type="button"
              className={styles.addLink}
              onClick={() =>
                onChange({ Links: [...fields.Links, { Title: "", Url: "", Subtext: null }] })
              }
              disabled={disabled}
            >
              + Link
            </button>
          </span>
          {fields.Links.length === 0 && (
            <small className={styles.msgHint}>
              Keine Links. Der Abschnitt erscheint dann nicht im Beitrag.
            </small>
          )}
          {fields.Links.map((link, i) => (
            <div key={i} className={styles.linkRow}>
              <input
                type="text"
                value={link.Title}
                onChange={(e) => updateLink(i, { Title: e.target.value })}
                placeholder="Titel"
                disabled={disabled}
                className={!link.Title.trim() ? styles.bad : undefined}
              />
              <input
                type="url"
                value={link.Url}
                onChange={(e) => updateLink(i, { Url: e.target.value })}
                placeholder="https://…"
                disabled={disabled}
                className={!link.Url.trim() ? styles.bad : undefined}
              />
              <input
                type="text"
                value={link.Subtext ?? ""}
                onChange={(e) => updateLink(i, { Subtext: e.target.value || null })}
                placeholder="Untertitel (optional)"
                disabled={disabled}
              />
              <button
                type="button"
                onClick={() => onChange({ Links: fields.Links.filter((_, j) => j !== i) })}
                disabled={disabled}
                className={styles.danger}
                title="Link entfernen"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        currentId={fields.heroImageId}
        onCancel={() => setPickerOpen(false)}
        onPick={(img) => {
          onHeroPick(img);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
