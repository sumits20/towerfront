import { defineConfig } from "vite";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@towerfront/shared": path.resolve(rootDir, "../shared/src/index.ts"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(rootDir, ".."), rootDir],
    },
  },
});
