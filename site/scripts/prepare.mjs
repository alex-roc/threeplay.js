// Prepares the generated static assets of the site (all gitignored):
//   public/vendor/threeplay/   the standalone engine build (three bundled, Rapier lazy chunk)
//   public/play/<example>/     every example, running against that build via an import map
//
// Requires the engine to be built first: `pnpm --filter threeplay build`.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..");
const standalone = join(repo, "packages/threeplay/dist/standalone");
const examplesDir = join(repo, "examples");

if (!existsSync(join(standalone, "threeplay.mjs"))) {
  console.error(
    "[site] packages/threeplay/dist/standalone is missing. Build the engine first:\n" +
      "       pnpm --filter threeplay build",
  );
  process.exit(1);
}

const vendor = join(site, "public/vendor/threeplay");
rmSync(vendor, { recursive: true, force: true });
mkdirSync(dirname(vendor), { recursive: true });
cpSync(standalone, vendor, { recursive: true });

const play = join(site, "public/play");
rmSync(play, { recursive: true, force: true });

// The examples import "threeplay" (a Vite alias in the monorepo); here an import map
// points it at the vendored build. Relative, so it works under any base path.
const importMap = `<script type="importmap">
      { "imports": { "threeplay": "../../vendor/threeplay/threeplay.mjs" } }
    </script>
    `;

const names = readdirSync(examplesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(examplesDir, d.name, "index.html")))
  .map((d) => d.name);

for (const name of names) {
  const out = join(play, name);
  mkdirSync(out, { recursive: true });
  const html = readFileSync(join(examplesDir, name, "index.html"), "utf8");
  const marker = '<script type="module"';
  if (!html.includes(marker)) throw new Error(`examples/${name}/index.html has no module script`);
  writeFileSync(join(out, "index.html"), html.replace(marker, `${importMap}${marker}`));
  cpSync(join(examplesDir, name, "main.js"), join(out, "main.js"));
}

console.log(`[site] vendored the engine and ${names.length} examples`);
