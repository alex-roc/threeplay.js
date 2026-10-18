import type { Engine } from "./core/types";

// Names that must never be overwritten on `window`.
const PROTECTED = new Set([
  "window",
  "document",
  "location",
  "history",
  "navigator",
  "screen",
  "parent",
  "top",
  "self",
  "frames",
  "opener",
  "name",
  "length",
  "status",
  "origin",
  "closed",
  "event",
  "performance",
  "console",
  "crypto",
  "localStorage",
  "sessionStorage",
  "fetch",
  "close",
  "open",
  "print",
  "focus",
  "blur",
  "alert",
  "confirm",
  "prompt",
  "postMessage",
]);

// Engine fields that only make sense on `k`.
const SKIP = new Set(["opts", "hooks", "plugins", "root"]);

/** The engine keys that global mode puts on `window`. */
export function globalKeys(k: Engine): string[] {
  return Object.keys(k).filter((key) => !SKIP.has(key) && !PROTECTED.has(key));
}

/**
 * Copies the engine API onto `globalThis`, the way kaplay's global mode does.
 * Functions are copied; every other field becomes a live accessor to `k`, so
 * `camera3d = new PerspectiveCamera()` in global mode really swaps the camera.
 * Returns a function that removes what it installed.
 */
export function installGlobals(k: Engine): () => void {
  const g = globalThis as Record<string, unknown>;
  // A previous engine (hot reload, a second threeplay() call) would keep
  // running on its own canvas: stop it first.
  const previous = g.k as Engine | undefined;
  if (previous && previous !== k && typeof previous.quit === "function") previous.quit();
  const installed = [...globalKeys(k), "k"];
  for (const key of globalKeys(k)) {
    const desc = Object.getOwnPropertyDescriptor(k, key)!;
    if (typeof desc.value === "function") {
      g[key] = desc.value;
      continue;
    }
    Object.defineProperty(g, key, {
      get: () => (k as any)[key],
      set: (v) => {
        (k as any)[key] = v;
      },
      configurable: true,
      enumerable: true,
    });
  }
  g.k = k;
  return () => {
    if (g.k !== k) return;
    for (const key of installed) delete g[key];
  };
}
