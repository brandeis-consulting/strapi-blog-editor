import type { Request, Response, NextFunction } from "express";

export const COOKIE_NAME = "blog_editor_session";

export interface AuthedRequest extends Request {
  jwt?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "Nicht angemeldet" });
    return;
  }
  req.jwt = token;
  next();
}
