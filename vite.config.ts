import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const apiPort = process.env.API_PORT ?? "8787";
const APP_BUILD_ID = "ext-only-v3";

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
  plugins: [
    react(),
    {
      name: "inject-build-id",
      transformIndexHtml(html) {
        return html.replace(
          "</head>",
          `<meta name="app-build-id" content="${APP_BUILD_ID}" /></head>`
        );
      },
    },
  ],
  root: "web",
  server: {
    port: 5173,
    fs: { allow: [projectRoot] },
    proxy: {
      "/api": {
        target: `http://0.0.0.0:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
});
