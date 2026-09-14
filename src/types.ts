// Shared type definitions for the frontend. These mirror the shapes returned
// by the Express API in `server/`. Keep this file in sync with
// `server/lib/strapi.ts` whenever fields change.

export interface PostSummary {
  documentId: string;
  Title: string;
  Slug: string;
  createdAt: string;
  updatedAt: string;
  Language: string | null;
}

export interface PostDetail extends PostSummary {
  Content: string;
  Excerpt: string | null;
  // Pflicht-Boolean beim Veröffentlichen (Strapi validiert es nur beim Publish,
  // nicht beim Draft-Speichern). null, wenn noch nie gesetzt.
  OverridePublishDate?: boolean | null;
  PublishDate?: string | null;
  IsCareer?: boolean | null;
  TemplateType?: string | null;
  HeroImage?: { id?: number; url: string } | null;
  Author?: { documentId?: string; Firstname: string; Lastname: string } | null;
  ba_blog_categories?: Array<{ documentId?: string; Slug: string }>;
  Links?: Array<{ id?: number; Title: string; Url: string; Subtext: string | null }>;
  translation_related_posts?: Array<{ documentId?: string; Slug: string; Language?: string | null }>;
}

/**
 * Die editierbaren Felder eines Beitrags — der Teil von PostDetail, den der
 * Editor schreiben darf. Relationen stehen als IDs, weil das Content-Manager-API
 * sie beim Schreiben so erwartet.
 */
export interface PostFields {
  Title: string;
  Slug: string;
  Excerpt: string | null;
  Language: string;
  TemplateType: string;
  IsCareer: boolean;
  OverridePublishDate: boolean;
  PublishDate: string | null;
  heroImageId: number | null;
  authorId: string | null;
  categoryIds: string[];
  Links: BlogLink[];
}

export interface BlogLink {
  /**
   * Strapi-interne ID der Component-Zeile. Wird beim Speichern zurückgeschickt,
   * damit Strapi die Zeile aktualisiert statt sie zu löschen und neu anzulegen.
   * Fehlt bei Einträgen, die im Editor neu hinzugekommen sind.
   */
  id?: number;
  Title: string;
  Url: string;
  Subtext: string | null;
}

/** Werte aus dem Strapi-Schema (ba-blog-post). Bei Schema-Änderung nachziehen. */
export const LANGUAGES = ["Deutsch", "Englisch"] as const;
export const TEMPLATE_TYPES = ["Standard", "Cheatsheet", "Newsletter"] as const;

/** Strapi-Locale je Sprachwert des Beitrags — wie in gatsby-node.js. */
export const LOCALE_BY_LANGUAGE: Record<string, string> = {
  Deutsch: "de",
  Englisch: "en",
};

export interface CategoryOption {
  documentId: string;
  Slug: string;
  Name: string;
  /** Name je Locale, für Beschriftung in der Sprache des Beitrags. */
  names: Record<string, string>;
}

export interface AuthorOption {
  documentId: string;
  Firstname: string;
  Lastname: string;
  /** Steuern auf der Live-Site die Verlinkung des Autorennamens. */
  ShowTrainerCard?: boolean;
  ShowAuthorCard?: boolean;
}

export interface MediaImage {
  id: number;
  name: string;
  url: string;
  mime: string;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

export interface NewPostInput {
  Title: string;
  Slug: string;
  Content: string;
  Language?: string;
}

export interface TranslationResult {
  post: PostDetail;
  slug: string;
  /** Nicht übernommene Felder/Relationen — leer, wenn alles geklappt hat. */
  warnings: string[];
}

export interface UploadedFile {
  id: number;
  name: string;
  url: string;
  mime: string;
  width?: number;
  height?: number;
}

export interface SessionUser {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  username?: string | null;
}

/** Leere Feldwerte — Basis für Posts, bei denen Strapi noch nichts gesetzt hat. */
export function fieldsFromPost(post: PostDetail): PostFields {
  return {
    Title: post.Title ?? "",
    Slug: post.Slug ?? "",
    Excerpt: post.Excerpt ?? null,
    Language: post.Language ?? "Deutsch",
    TemplateType: post.TemplateType ?? "Standard",
    IsCareer: post.IsCareer ?? false,
    OverridePublishDate: post.OverridePublishDate ?? false,
    PublishDate: post.PublishDate ?? null,
    heroImageId: post.HeroImage?.id ?? null,
    authorId: post.Author?.documentId ?? null,
    categoryIds: (post.ba_blog_categories ?? [])
      .map((c) => c.documentId)
      .filter((id): id is string => Boolean(id)),
    Links: (post.Links ?? []).map((l) => ({
      ...(l.id !== undefined ? { id: l.id } : {}),
      Title: l.Title,
      Url: l.Url,
      Subtext: l.Subtext ?? null,
    })),
  };
}

/**
 * Vergleich für die Dirty-Erkennung. JSON-Stringify reicht, weil alle Felder
 * primitiv oder flache Arrays sind — bei categoryIds ist die Reihenfolge
 * allerdings bedeutungslos, daher wird sie vorher normalisiert.
 */
export function fieldsEqual(a: PostFields, b: PostFields): boolean {
  const norm = (f: PostFields) => ({ ...f, categoryIds: [...f.categoryIds].sort() });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
