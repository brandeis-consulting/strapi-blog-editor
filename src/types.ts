import type { StrapiBridge, AuthBridge } from "../electron/preload";

declare global {
  interface Window {
    strapi: StrapiBridge;
    auth: AuthBridge;
  }
}

export type { PostDetail, PostSummary } from "../electron/strapi";
export type { SessionUser } from "../electron/auth";
