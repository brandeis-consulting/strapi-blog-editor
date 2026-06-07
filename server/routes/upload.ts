import { Router } from "express";
import multer from "multer";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { StrapiClient } from "../lib/strapi";

const STRAPI_URL = process.env.STRAPI_URL ?? "https://cms.brandeis.de";
const MAX_BYTES = 15 * 1024 * 1024;
const UPLOAD_FOLDER_ID = process.env.UPLOAD_FOLDER_ID
  ? parseInt(process.env.UPLOAD_FOLDER_ID, 10)
  : undefined;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

export const uploadRouter = Router();
uploadRouter.use(requireAuth);

uploadRouter.post("/image", upload.single("file"), async (req: AuthedRequest, res) => {
  const file = (req as AuthedRequest & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "Keine Datei übermittelt" });
    return;
  }
  if (!file.mimetype.startsWith("image/")) {
    res.status(400).json({ error: `Unzulässiger Dateityp: ${file.mimetype}` });
    return;
  }
  try {
    const client = new StrapiClient(STRAPI_URL, req.jwt!);
    const uploaded = await client.uploadImage(
      new Uint8Array(file.buffer),
      file.originalname || `paste-${Date.now()}.png`,
      file.mimetype,
      UPLOAD_FOLDER_ID,
    );
    res.json(uploaded);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("AUTH_EXPIRED:")) {
      res.clearCookie("blog_editor_session", { path: "/" });
      res.status(401).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});
