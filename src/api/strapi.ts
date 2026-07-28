import type {
  NewPostInput,
  PostDetail,
  PostSummary,
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

export const strapi = {
  listPosts: (): Promise<PostSummary[]> => api("GET", "/api/posts"),
  getPost: (id: string): Promise<PostDetail | null> => api("GET", `/api/posts/${id}`),
  saveDraft: (id: string, content: string): Promise<PostDetail> =>
    api("PUT", `/api/posts/${id}`, { content }),
  publish: (id: string, overridePublishDate: boolean): Promise<PostDetail> =>
    api("POST", `/api/posts/${id}/publish`, { overridePublishDate }),
  createPost: (input: NewPostInput): Promise<PostDetail> => api("POST", "/api/posts", input),
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
