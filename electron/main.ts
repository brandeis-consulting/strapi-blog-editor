import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { StrapiClient } from "./strapi";
import { AuthService } from "./auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

loadDotEnv();

const STRAPI_URL = process.env.STRAPI_URL ?? "https://cms.brandeis.de";

let win: BrowserWindow | null = null;
let auth: AuthService | null = null;

function loadDotEnv(): void {
  const envPath = path.join(process.env.APP_ROOT ?? process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, valueRaw] = match;
    const value = valueRaw.replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function getAuth(): AuthService {
  if (!auth) auth = new AuthService(STRAPI_URL);
  return auth;
}

function getStrapi(): StrapiClient {
  const jwt = getAuth().getJwt();
  if (!jwt) throw new Error("Nicht angemeldet");
  return new StrapiClient(STRAPI_URL, jwt);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    title: "Brandeis Blog Editor",
    webPreferences: {
      preload: path.join(MAIN_DIST, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

ipcMain.handle("auth:login", async (_e, identifier: string, password: string) => {
  return getAuth().login(identifier, password);
});

ipcMain.handle("auth:logout", () => {
  getAuth().logout();
});

ipcMain.handle("auth:status", async () => {
  return getAuth().verify();
});

ipcMain.handle("strapi:list-posts", async () => {
  return getStrapi().listPosts();
});

ipcMain.handle("strapi:get-post", async (_event, documentId: string) => {
  return getStrapi().getPost(documentId);
});

ipcMain.handle(
  "strapi:save-draft",
  async (_event, documentId: string, content: string) => {
    return getStrapi().saveDraft(documentId, content);
  },
);

ipcMain.handle("strapi:publish", async (_event, documentId: string) => {
  return getStrapi().publish(documentId);
});

ipcMain.handle(
  "strapi:create-post",
  async (_event, input: { Title: string; Slug: string; Content: string; Language?: string }) => {
    return getStrapi().createPost(input);
  },
);

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
  win = null;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
