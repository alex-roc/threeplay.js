/** Message the preview iframe posts to its parent (console output, errors, run requests). */
export interface RunnerMessage {
  source: "threeplay-runner";
  type: "log" | "run";
  level?: "log" | "warn" | "error";
  text?: string;
}

// Runs inside the preview iframe: forwards console output and uncaught errors to the parent
// and lets Ctrl/Cmd+Enter re-run the code even while the game has the keyboard focus.
const BRIDGE = `
const LINE_OFFSET = __OFFSET__;
const send = (msg) => parent.postMessage({ source: "threeplay-runner", ...msg }, "*");
const fmt = (v) => v instanceof Error ? (v.stack || v.message) : typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
for (const level of ["log", "warn", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => { send({ type: "log", level, text: args.map(fmt).join(" ") }); orig(...args); };
}
addEventListener("error", (e) => send({ type: "log", level: "error", text: e.message + (e.lineno > LINE_OFFSET ? " (line " + (e.lineno - LINE_OFFSET) + ")" : "") }));
addEventListener("unhandledrejection", (e) => send({ type: "log", level: "error", text: "Unhandled rejection: " + fmt(e.reason) }));
addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send({ type: "run" }); } });
`;

/**
 * Builds the `srcdoc` of a preview iframe: an import map that resolves `threeplay` to the
 * vendored standalone build, plus the user's code as a module script.
 *
 * @param vendorUrl Absolute URL of `vendor/threeplay/threeplay.mjs` (srcdoc has no useful base).
 */
export function buildSrcdoc(code: string, vendorUrl: string, { bridge = true } = {}): string {
  const safe = code.replace(/<\/script/gi, "<\\/script");
  const html = (offset: number) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#111;overflow:hidden}canvas{display:block}</style>
${bridge ? `<script>${BRIDGE.replace("__OFFSET__", String(offset))}</script>` : ""}
<script type="importmap">${JSON.stringify({ imports: { threeplay: vendorUrl } })}</script>
</head>
<body>
<script type="module">
${safe}
</script>
</body>
</html>`;
  // Error line numbers are relative to the document: tell the bridge how many lines come before the code.
  const probe = html(0);
  return html(probe.slice(0, probe.lastIndexOf(safe)).split("\n").length - 1);
}

/** Absolute URL of the vendored engine, from a base-aware site path. */
export function vendorUrl(sitePath: string): string {
  return new URL(sitePath, location.href).href;
}

/** UTF-8 text to base64url, for sharing code in the URL hash. */
export function encodeCode(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Inverse of {@link encodeCode}; returns `null` if the input is not valid. */
export function decodeCode(encoded: string): string | null {
  try {
    const b64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
