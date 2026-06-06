import type { PostDetail, PostSummary } from "../types";
import type { NewPostInput } from "../../electron/strapi";

declare const __APP_MODE__: "web" | "electron";

const AUTH_EXPIRED_PREFIX = "AUTH_EXPIRED:";

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

// --- Electron path -------------------------------------------------------

async function callElectron<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith(AUTH_EXPIRED_PREFIX)) {
      onUnauthorized?.();
    }
    throw e;
  }
}

// --- Web path ------------------------------------------------------------

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
    throw new Error("AUTH_EXPIRED:Sitzung abgelaufen — bitte neu anmelden.");
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

// --- Unified facade ------------------------------------------------------

const isWeb = __APP_MODE__ === "web";

export const strapi = {
  listPosts: (): Promise<PostSummary[]> =>
    isWeb ? api("GET", "/api/posts") : callElectron(() => window.strapi.listPosts()),
  getPost: (id: string): Promise<PostDetail | null> =>
    isWeb ? api("GET", `/api/posts/${id}`) : callElectron(() => window.strapi.getPost(id)),
  saveDraft: (id: string, content: string): Promise<PostDetail> =>
    isWeb
      ? api("PUT", `/api/posts/${id}`, { content })
      : callElectron(() => window.strapi.saveDraft(id, content)),
  publish: (id: string): Promise<PostDetail> =>
    isWeb
      ? api("POST", `/api/posts/${id}/publish`)
      : callElectron(() => window.strapi.publish(id)),
  createPost: (input: NewPostInput): Promise<PostDetail> =>
    isWeb ? api("POST", "/api/posts", input) : callElectron(() => window.strapi.createPost(input)),
};

export type { NewPostInput };
