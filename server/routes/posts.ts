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

// Auswahllisten für den Feld-Editor. Vor "/:id" registriert, sonst würde diese
// Route "meta" als documentId auffassen.
postsRouter.get("/meta/categories", (req, res) =>
  run(res, () => client(req).listCategories()),
);
postsRouter.get("/meta/authors", (req, res) => run(res, () => client(req).listAuthors()));
postsRouter.get("/meta/media", (req, res) =>
  run(res, () => client(req).listMediaImages(typeof req.query.q === "string" ? req.query.q : undefined)),
);
postsRouter.get("/meta/slugs", (req, res) => run(res, () => client(req).listSlugs()));

postsRouter.get("/", (req, res) => run(res, () => client(req).listPosts()));
postsRouter.get("/:id", (req, res) => run(res, () => client(req).getPost(req.params.id)));
postsRouter.put("/:id", (req, res) =>
  run(res, () =>
    client(req).saveDraft(req.params.id, {
      content: req.body?.content,
      fields: req.body?.fields,
    }),
  ),
);
postsRouter.post("/:id/publish", (req, res) =>
  run(res, () => client(req).publish(req.params.id, req.body?.overridePublishDate)),
);
postsRouter.post("/", (req, res) => run(res, () => client(req).createPost(req.body)));
