import type { AuthorOption, CategoryOption, PostDetail, PostFields } from "../types";

/**
 * Übersetzt den Editor-Zustand in die Beitragsform, die die Gatsby-Templates
 * erwarten.
 *
 * Das ist der **Vertrag zwischen den beiden Repos**. Auf der Gegenseite steht
 * brandeis-academy/src/pages/blog-preview.js, das diese Struktur an
 * default-body / cheatsheet-body / newsletter-body weiterreicht. Ändert sich
 * dort eine erwartete Eigenschaft, muss sie hier nachgezogen werden — die
 * Feldnamen sind bewusst identisch zur Strapi-/GraphQL-Schreibweise, damit der
 * Abgleich mit gatsby-node.js einfach bleibt.
 *
 * Bewusst *nicht* enthalten: `others` (weitere Beiträge) und alles, was der
 * SEO-Kopf braucht. Beides gehört zur Seite, nicht zum Artikel, und die
 * Vorschauseite rendert es nicht.
 */
export interface PreviewPost {
  documentId: string;
  Title: string;
  Slug: string;
  Language: string;
  TemplateType: string;
  /**
   * Das Datum, das die Templates anzeigen. gatsby-node.js überschreibt
   * `createdAt` mit `PublishDate`, sobald eines gesetzt ist — hier passiert
   * dasselbe, sonst zeigte die Vorschau ein anderes Datum als die Live-Seite.
   */
  createdAt: string;
  PublishDate: string | null;
  HeroImage: { url: string } | null;
  Author: {
    Firstname: string;
    Lastname: string;
    ShowTrainerCard: boolean;
    ShowAuthorCard: boolean;
  } | null;
  ba_blog_categories: Array<{ Slug: string }>;
  Links: Array<{ Title: string; Url: string; Subtext: string | null }>;
}

export interface PreviewUpdateMessage {
  type: "preview-update";
  post: PreviewPost;
  content: string;
}

export function buildPreviewPost(
  detail: PostDetail,
  fields: PostFields,
  lookup: {
    categories: CategoryOption[];
    authors: AuthorOption[];
    /** URL je Medien-ID aus dem Cache der AppShell. */
    heroUrl: string | null;
  },
): PreviewPost {
  const author = fields.authorId
    ? lookup.authors.find((a) => a.documentId === fields.authorId) ?? null
    : null;

  return {
    documentId: detail.documentId,
    Title: fields.Title,
    Slug: fields.Slug,
    Language: fields.Language,
    TemplateType: fields.TemplateType,
    createdAt: fields.PublishDate || detail.createdAt,
    PublishDate: fields.PublishDate,
    HeroImage: lookup.heroUrl ? { url: lookup.heroUrl } : null,
    Author: author
      ? {
          Firstname: author.Firstname,
          Lastname: author.Lastname,
          ShowTrainerCard: author.ShowTrainerCard ?? false,
          ShowAuthorCard: author.ShowAuthorCard ?? false,
        }
      : null,
    // Die Vorschauseite schlägt die Labels selbst nach (Static Query auf die
    // Kategorien) — sie braucht nur die Slugs.
    ba_blog_categories: fields.categoryIds
      .map((id) => lookup.categories.find((c) => c.documentId === id))
      .filter((c): c is CategoryOption => Boolean(c))
      .map((c) => ({ Slug: c.Slug })),
    Links: fields.Links.map((l) => ({
      Title: l.Title,
      Url: l.Url,
      Subtext: l.Subtext,
    })),
  };
}
