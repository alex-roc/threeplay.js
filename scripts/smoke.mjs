// Smoke test: opens every example in headless Chrome, waits until the game
// is loaded and has rendered a few frames, fails on console errors and saves
// a screenshot per example to smoke-output/ (look at them!).
//
//   pnpm smoke                 all examples
//   pnpm smoke platformer-3d   only some
//
// Uses the system Chrome locally (channel "chrome") and Playwright's Chromium
// in CI (`pnpm exec playwright install chromium`).
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = new URL("../examples/", import.meta.url).pathname;
const only = process.argv.slice(2);
const examples = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "index.html")))
  .map((d) => d.name)
  .filter((name) => only.length === 0 || only.includes(name));

const server = await createServer({
  configFile: join(root, "vite.config.ts"),
  server: { port: 0 },
  logLevel: "error",
});
await server.listen();
const base = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
  args: ["--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
});
mkdirSync("smoke-output", { recursive: true });

let failed = 0;
for (const name of examples) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  // renderer=webgl: headless Chrome has no WebGPU adapter.
  await page.goto(`${base}${name}/index.html?renderer=webgl`);
  try {
    await page.waitForFunction(
      () => globalThis.k?.isLoaded?.() && globalThis.k.time() > 0.5,
      null,
      {
        timeout: 20000,
      },
    );
  } catch {
    errors.push("timed out waiting for the game to load and run");
  }
  await page.screenshot({ path: `smoke-output/${name}.png` });
  const objects = await page.evaluate(() => globalThis.k?.get("*").length ?? 0);
  if (errors.length) {
    failed++;
    console.log(`✗ ${name}\n  ${errors.join("\n  ")}`);
  } else {
    console.log(`✓ ${name} (${objects} objects)`);
  }
  await page.close();
}

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
