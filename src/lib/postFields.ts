import type { AuthorOption, CategoryOption, PostFields } from "../types";

/**
 * Slug aus einem Titel erzeugen.
 *
 * Strapi benutzt für `uid`-Felder @sindresorhus/slugify. Das hier ist bewusst
 * eine Nachbildung und kein Aufruf des Strapi-Endpunkts: der Vorschlag entsteht
 * beim Tippen, ein Request pro Tastendruck wäre unverhältnismäßig. Die deutsche
 * Umlautbehandlung (ä→a, ß→ss) ist die einzige Stelle, an der die Nachbildung
 * überhaupt vom Default abweichen könnte — deshalb steht sie explizit hier.
 *
 * Der Slug bleibt frei editierbar; wer die Vorlage nicht mag, überschreibt sie.
 */
export function slugify(title: string): string {
  const umlauts: Record<string, string> = {
    ä: "a", ö: "o", ü: "u", ß: "ss",
    Ä: "a", Ö: "o", Ü: "u",
    á: "a", à: "a", â: "a", é: "e", è: "e", ê: "e",
    í: "i", ì: "i", ó: "o", ò: "o", ô: "o", ú: "u", ù: "u", ñ: "n", ç: "c",
  };
  return title
    .replace(/[äöüßÄÖÜáàâéèêíìóòôúùñç]/g, (c) => umlauts[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface FieldIssue {
  field: keyof PostFields | "Links";
  message: string;
  /** Blockiert das Speichern. Warnungen (false) sind nur Hinweise. */
  blocking: boolean;
}

/**
 * Prüft gegen die Regeln aus dem Strapi-Schema (ba-blog-post), damit ein
 * Verstoß hier auffällt und nicht erst als 400 aus dem CMS zurückkommt.
 *
 * `takenSlugs` enthält die Slugs *aller anderen* Beiträge — inklusive Entwürfe,
 * denn ein als Entwurf belegter Slug ist ebenso belegt.
 */
export function validatePostFields(
  fields: PostFields,
  takenSlugs: Set<string>,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const title = fields.Title.trim();

  if (title.length < 2) {
    issues.push({ field: "Title", message: "Titel braucht mindestens 2 Zeichen.", blocking: true });
  } else if (title.length > 256) {
    issues.push({
      field: "Title",
      message: `Titel ist ${title.length} Zeichen lang, erlaubt sind 256.`,
      blocking: true,
    });
  }

  const slug = fields.Slug.trim();
  if (!slug) {
    issues.push({ field: "Slug", message: "Slug ist ein Pflichtfeld.", blocking: true });
  } else if (slug !== slugify(slug)) {
    issues.push({
      field: "Slug",
      message: "Slug enthält Zeichen, die Strapi umschreiben wird (nur a–z, 0–9 und Bindestrich).",
      blocking: false,
    });
  } else if (takenSlugs.has(slug)) {
    issues.push({
      field: "Slug",
      message: "Dieser Slug ist bereits vergeben — die URL würde kollidieren.",
      blocking: true,
    });
  }

  if (fields.OverridePublishDate && !fields.PublishDate) {
    issues.push({
      field: "PublishDate",
      message: "Ohne Datum bewirkt das Überschreiben nichts.",
      blocking: false,
    });
  }

  fields.Links.forEach((link, i) => {
    if (!link.Title.trim() || !link.Url.trim()) {
      issues.push({
        field: "Links",
        message: `Link ${i + 1}: Titel und URL sind Pflichtfelder.`,
        blocking: true,
      });
    }
  });

  return issues;
}

/**
 * Beschreibt in Worten, was sich an den Feldern geändert hat — für den
 * Speichern-Dialog. Der Zeilen-Diff daneben zeigt nur den Markdown-Inhalt;
 * ohne diese Liste würde ein Autorenwechsel oder ein neues Beitragsbild
 * unbemerkt mitgespeichert.
 */
export function describeFieldChanges(
  before: PostFields,
  after: PostFields,
  lookup: { categories: CategoryOption[]; authors: AuthorOption[] },
): string[] {
  const out: string[] = [];
  const text = (label: string, a: unknown, b: unknown) => {
    if (a === b) return;
    const fmt = (v: unknown) => (v === null || v === "" ? "—" : String(v));
    out.push(`${label}: ${fmt(a)} → ${fmt(b)}`);
  };

  text("Titel", before.Title, after.Title);
  text("Slug", before.Slug, after.Slug);
  text("Kurzbeschreibung", before.Excerpt, after.Excerpt);
  text("Sprache", before.Language, after.Language);
  text("Template", before.TemplateType, after.TemplateType);
  text("Karriere-Beitrag", before.IsCareer ? "ja" : "nein", after.IsCareer ? "ja" : "nein");
  text(
    "Datum überschreiben",
    before.OverridePublishDate ? "ja" : "nein",
    after.OverridePublishDate ? "ja" : "nein",
  );
  text("Veröffentlichungsdatum", before.PublishDate, after.PublishDate);

  const authorName = (id: string | null) => {
    if (!id) return "—";
    const a = lookup.authors.find((x) => x.documentId === id);
    return a ? `${a.Firstname} ${a.Lastname}` : id;
  };
  text("Autor", authorName(before.authorId), authorName(after.authorId));

  if (before.heroImageId !== after.heroImageId) {
    out.push(
      after.heroImageId === null
        ? "Beitragsbild: entfernt"
        : before.heroImageId === null
          ? "Beitragsbild: neu gesetzt"
          : "Beitragsbild: ersetzt",
    );
  }

  const catName = (id: string) =>
    lookup.categories.find((c) => c.documentId === id)?.Name ?? id;
  const removed = before.categoryIds.filter((id) => !after.categoryIds.includes(id));
  const added = after.categoryIds.filter((id) => !before.categoryIds.includes(id));
  if (added.length) out.push(`Kategorien +: ${added.map(catName).join(", ")}`);
  if (removed.length) out.push(`Kategorien −: ${removed.map(catName).join(", ")}`);

  if (JSON.stringify(before.Links) !== JSON.stringify(after.Links)) {
    out.push(`Nützliche Links: ${before.Links.length} → ${after.Links.length} Eintrag/Einträge`);
  }

  return out;
}
