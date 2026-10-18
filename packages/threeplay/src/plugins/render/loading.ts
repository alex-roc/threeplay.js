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
