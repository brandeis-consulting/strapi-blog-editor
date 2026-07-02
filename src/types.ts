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
  HeroImage?: { url: string } | null;
  Author?: { Firstname: string; Lastname: string } | null;
  ba_blog_categories?: Array<{ Slug: string }>;
  Links?: Array<{ Title: string; Url: string; Subtext: string | null }>;
}

export interface NewPostInput {
  Title: string;
  Slug: string;
  Content: string;
  Language?: string;
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
