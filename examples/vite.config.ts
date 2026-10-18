import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Dev server for the examples: `threeplay` resolves to the package source, so
// edits to the engine hot-reload. The site serves the same examples against the
// standalone build through an import map.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      threeplay: fileURLToPath(new URL("../packages/threeplay/src/index.ts", import.meta.url)),
    },
  },
  server: { open: false },
});
