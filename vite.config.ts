import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import os from "node:os";

// Keep dependency cache off the Google Drive-synced folder — Drive locks files
// during sync, which crashes Vite's optimizer with EPERM on rmdir.
const cacheDir = path.join(os.tmpdir(), "strapi-blog-editor-vite-cache");

export default defineConfig({
  cacheDir,
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  css: {
    modules: { localsConvention: "camelCaseOnly" },
    preprocessorOptions: { scss: { api: "modern-compiler" } },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: { outDir: "dist" },
});
