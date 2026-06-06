import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import path from "node:path";
import os from "node:os";

// Keep dependency cache off the Google Drive-synced folder — Drive locks files
// during sync, which crashes Vite's optimizer with EPERM on rmdir.
const cacheDir = path.join(os.tmpdir(), "strapi-blog-editor-vite-cache");

export default defineConfig(({ mode }) => {
  const isWeb = mode === "web";

  return {
    cacheDir,
    plugins: [
      react(),
      ...(isWeb
        ? []
        : [
            electron({
              main: {
                entry: "electron/main.ts",
                vite: {
                  build: {
                    outDir: "dist-electron",
                    rollupOptions: { external: ["electron"] },
                  },
                },
              },
              preload: {
                input: "electron/preload.ts",
                vite: {
                  build: {
                    outDir: "dist-electron",
                    rollupOptions: { external: ["electron"] },
                  },
                },
              },
              renderer: {},
            }),
          ]),
    ],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    css: {
      modules: { localsConvention: "camelCaseOnly" },
      preprocessorOptions: { scss: { api: "modern-compiler" } },
    },
    server: isWeb
      ? {
          port: 5173,
          proxy: {
            "/api": {
              target: "http://localhost:3000",
              changeOrigin: true,
            },
          },
        }
      : undefined,
    define: {
      __APP_MODE__: JSON.stringify(isWeb ? "web" : "electron"),
    },
    build: { outDir: "dist" },
  };
});
