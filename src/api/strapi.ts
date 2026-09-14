import type {
  AuthorOption,
  CategoryOption,
  MediaImage,
  NewPostInput,
  PostDetail,
  PostFields,
  PostSummary,
  TranslationResult,
  UploadedFile,
} from "../types";

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

async function api<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error("Sitzung abgelaufen — bitte neu anmelden.");
  }
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      throw new Error(j.error ?? `${res.status}: ${text}`);
    } catch {
      throw new Error(`${res.status}: ${text}`);
    }
  }
  return (await res.json()) as T;
}

/** Laufzeit-Konfiguration vom eigenen Server (u.a. die Vorschau-URL). */
export interface AppConfig {
  previewUrl: string;
}

export const strapi = {
  getConfig: (): Promise<AppConfig> => api("GET", "/api/config"),
  listPosts: (): Promise<PostSummary[]> => api("GET", "/api/posts"),
  getPost: (id: string): Promise<PostDetail | null> => api("GET", `/api/posts/${id}`),
  /**
   * Speichert Inhalt und/oder Felder als Entwurf. Beide Teile sind optional —
   * der Editor schickt nur, was sich geändert hat, und der Server macht daraus
   * genau einen PUT gegen Strapi.
   */
  saveDraft: (
    id: string,
    patch: { content?: string; fields?: PostFields },
  ): Promise<PostDetail> => api("PUT", `/api/posts/${id}`, patch),
  publish: (id: string, overridePublishDate: boolean): Promise<PostDetail> =>
    api("POST", `/api/posts/${id}/publish`, { overridePublishDate }),
  createPost: (input: NewPostInput): Promise<PostDetail> => api("POST", "/api/posts", input),

  listCategories: (): Promise<CategoryOption[]> => api("GET", "/api/posts/meta/categories"),
  listAuthors: (): Promise<AuthorOption[]> => api("GET", "/api/posts/meta/authors"),
  listSlugs: (): Promise<string[]> => api("GET", "/api/posts/meta/slugs"),
  listMedia: (search?: string): Promise<MediaImage[]> =>
    api("GET", `/api/posts/meta/media${search ? `?q=${encodeURIComponent(search)}` : ""}`),

  /**
   * Übersetzt einen Beitrag ins Englische und legt ihn als Entwurf an.
   * Der API-Key geht nur an das eigene Backend und wird dort nicht gespeichert.
   */
  translate: (documentId: string, apiKey: string): Promise<TranslationResult> =>
    api("POST", "/api/translate", { documentId, apiKey }),
  uploadImage: async (file: File): Promise<UploadedFile> => {
    const form = new FormData();
    form.append("file", file, file.name || "paste.png");
    const res = await fetch("/api/upload/image", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (res.status === 401) {
      onUnauthorized?.();
      throw new Error("Sitzung abgelaufen — bitte neu anmelden.");
    }
    if (!res.ok) {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { error?: string };
        throw new Error(j.error ?? `${res.status}: ${text}`);
      } catch {
        throw new Error(`${res.status}: ${text}`);
      }
    }
    return (await res.json()) as UploadedFile;
  },
};

export type { NewPostInput, UploadedFile };
