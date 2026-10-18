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

/** Copies the engine API onto `globalThis`, the way kaplay's global mode does. */
export function installGlobals(k: Engine) {
  const g = globalThis as Record<string, unknown>;
  for (const key of Object.keys(k)) {
    if (SKIP.has(key) || PROTECTED.has(key)) continue;
    const desc = Object.getOwnPropertyDescriptor(k, key)!;
    if (desc.get || desc.set) {
      Object.defineProperty(g, key, {
        get: desc.get ? () => (k as any)[key] : undefined,
        set: desc.set
          ? (v) => {
              (k as any)[key] = v;
            }
          : undefined,
        configurable: true,
      });
    } else {
      g[key] = desc.value;
    }
  }
  g.k = k;
}
