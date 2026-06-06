import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { StrapiClient } from "../lib/strapi";

const STRAPI_URL = process.env.STRAPI_URL ?? "https://cms.brandeis.de";

export const postsRouter = Router();
postsRouter.use(requireAuth);

function client(req: AuthedRequest): StrapiClient {
  return new StrapiClient(STRAPI_URL, req.jwt!);
}

async function run<T>(res: Response, fn: () => Promise<T>): Promise<void> {
  try {
    res.json(await fn());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("AUTH_EXPIRED:")) {
      res.clearCookie("blog_editor_session", { path: "/" });
      res.status(401).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
}

postsRouter.get("/", (req, res) => run(res, () => client(req).listPosts()));
postsRouter.get("/:id", (req, res) => run(res, () => client(req).getPost(req.params.id)));
postsRouter.put("/:id", (req, res) =>
  run(res, () => client(req).saveDraft(req.params.id, req.body.content)),
);
postsRouter.post("/:id/publish", (req, res) =>
  run(res, () => client(req).publish(req.params.id)),
);
postsRouter.post("/", (req, res) => run(res, () => client(req).createPost(req.body)));
