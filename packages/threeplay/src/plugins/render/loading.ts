/**
 * Shows a minimal progress bar on `overlay` until the returned function is
 * called. The core loop doesn't run frames while loading, so the bar updates
 * itself with requestAnimationFrame.
 */
export function showLoadingBar(overlay: HTMLElement, progress: () => number): () => void {
  const track = document.createElement("div");
  track.style.cssText =
    "position:absolute;left:50%;top:50%;width:40%;max-width:480px;height:6px;transform:translate(-50%,-50%);background:rgba(255,255,255,.25);border-radius:3px;overflow:hidden";
  const fill = document.createElement("div");
  fill.style.cssText = "height:100%;width:0;background:#fff;border-radius:3px";
  track.appendChild(fill);
  overlay.appendChild(track);

  let raf = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    fill.style.width = `${Math.round(progress() * 100)}%`;
    raf = requestAnimationFrame(tick);
  };
  if (typeof requestAnimationFrame === "function") tick();

  return () => {
    if (stopped) return;
    stopped = true;
    if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    track.remove();
  };
}

/**
 * Shows an uncaught error over the game (the core stops the loop on errors
 * instead of freezing silently). Escaped as text, never as HTML.
 */
export function showError(overlay: HTMLElement, err: unknown) {
  const box = document.createElement("div");
  box.style.cssText =
    "position:absolute;inset:0;padding:24px;box-sizing:border-box;background:rgba(20,20,40,.88);color:#fff;font:14px/1.4 ui-monospace,monospace;white-space:pre-wrap;overflow:auto;pointer-events:auto";
  const title = document.createElement("div");
  title.style.cssText = "font-weight:bold;font-size:18px;margin-bottom:12px;color:#ff8fa3";
  title.textContent = "Error — the game stopped";
  const body = document.createElement("div");
  body.textContent = err instanceof Error ? `${err.message}\n\n${err.stack ?? ""}` : String(err);
  box.append(title, body);
  overlay.appendChild(box);
}
