import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { authRouter } from "./routes/auth";
import { postsRouter } from "./routes/posts";
import { translateRouter } from "./routes/translate";
import { uploadRouter } from "./routes/upload";

const PORT = Number(process.env.PORT ?? 3000);
const STATIC_DIR = path.resolve(__dirname, "..", "dist");

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "img-src": ["'self'", "data:", "https://cms.brandeis.de"],
        "connect-src": ["'self'"],
      },
    },
  }),
);
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/auth", authRouter);
app.use("/api/posts", postsRouter);
app.use("/api/translate", translateRouter);
app.use("/api/upload", uploadRouter);

app.use(express.static(STATIC_DIR));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Blog editor listening on :${PORT}`);
});
