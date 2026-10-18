import { defineConfig } from "vite";

// npm build: ESM with three (and its subpaths) left as peer imports.
// Rapier is a regular dependency, imported lazily so it lands in its own chunk.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    lib: {
      entry: { threeplay: "src/index.ts" },
      formats: ["es"],
    },
    rolldownOptions: {
      external: [/^three(\/.*)?$/, /^@dimforge\/rapier3d-compat/],
      output: { chunkFileNames: "chunks/[name]-[hash].js" },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
