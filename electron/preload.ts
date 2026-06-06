import { contextBridge, ipcRenderer } from "electron";
import type { PostDetail, PostSummary, NewPostInput } from "./strapi";
import type { SessionUser } from "./auth";

const strapi = {
  listPosts: (): Promise<PostSummary[]> => ipcRenderer.invoke("strapi:list-posts"),
  getPost: (documentId: string): Promise<PostDetail | null> =>
    ipcRenderer.invoke("strapi:get-post", documentId),
  saveDraft: (documentId: string, content: string): Promise<PostDetail> =>
    ipcRenderer.invoke("strapi:save-draft", documentId, content),
  publish: (documentId: string): Promise<PostDetail> =>
    ipcRenderer.invoke("strapi:publish", documentId),
  createPost: (input: NewPostInput): Promise<PostDetail> =>
    ipcRenderer.invoke("strapi:create-post", input),
};

const auth = {
  login: (email: string, password: string): Promise<SessionUser> =>
    ipcRenderer.invoke("auth:login", email, password),
  logout: (): Promise<void> => ipcRenderer.invoke("auth:logout"),
  status: (): Promise<SessionUser | null> => ipcRenderer.invoke("auth:status"),
};

contextBridge.exposeInMainWorld("strapi", strapi);
contextBridge.exposeInMainWorld("auth", auth);

export type StrapiBridge = typeof strapi;
export type AuthBridge = typeof auth;
