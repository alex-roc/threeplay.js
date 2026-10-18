import { defineConfig } from "vite";

// Standalone build: three bundled in, for use without a bundler
// (<script type="module">, import maps, vendored copies). Rapier stays in a
// separate chunk that is only downloaded when physics is enabled.
export default defineConfig({
  build: {
    outDir: "dist/standalone",
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    lib: {
      entry: { threeplay: "src/index.ts" },
      formats: ["es"],
      fileName: (_format, name) => `${name}.mjs`,
    },
    rolldownOptions: {
      output: { chunkFileNames: "[name]-[hash].mjs" },
    },
  },
});
