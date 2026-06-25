import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const apiPort = process.env.API_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
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
