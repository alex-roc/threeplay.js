// Copies the smoke-test screenshots of every example into src/assets/thumbs/
// (committed: the site and the README use them). Run through `pnpm thumbs`.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dest = join(repo, "site/src/assets/thumbs");
mkdirSync(dest, { recursive: true });

const examples = readdirSync(join(repo, "examples"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
for (const name of examples) {
  const shot = join(repo, "smoke-output", `${name}.png`);
  if (!existsSync(shot)) {
    console.warn(`[thumbs] no screenshot for ${name}, skipped`);
    continue;
  }
  copyFileSync(shot, join(dest, `${name}.png`));
  console.log(`[thumbs] ${name}`);
}
