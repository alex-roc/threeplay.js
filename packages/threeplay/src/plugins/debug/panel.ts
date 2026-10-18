import type { LogLine } from "./log";

const BASE_STYLE =
  "position:absolute;margin:0;padding:4px 6px;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;" +
  "color:#fff;pointer-events:none;white-space:pre;border-radius:3px;z-index:1000;";

/**
 * The debug DOM on the render overlay: an inspector panel (top-left) and the
 * on-screen log (bottom-left). Only created when there is an overlay, so the
 * headless engine never touches the DOM.
 */
export class DebugUI {
  private readonly panel: HTMLElement;
  private readonly log: HTMLElement;
  private panelText = "";
  private logKey = "";

  constructor(overlay: HTMLElement) {
    const doc = overlay.ownerDocument;
    this.panel = doc.createElement("pre");
    this.panel.style.cssText = `${BASE_STYLE}left:6px;top:6px;background:rgba(0,0,0,.55);`;
    this.panel.style.display = "none";
    this.log = doc.createElement("div");
    this.log.style.cssText = `${BASE_STYLE}left:6px;bottom:6px;padding:0;`;
    overlay.append(this.panel, this.log);
  }

  /** Shows or hides the inspector panel. */
  setPanelVisible(visible: boolean) {
    this.panel.style.display = visible ? "block" : "none";
  }

  /** Sets the panel text (skipped when unchanged, to avoid needless layout). */
  setPanelText(text: string) {
    if (text === this.panelText) return;
    this.panelText = text;
    this.panel.textContent = text;
  }

  /** Draws the log lines, each with its own opacity. */
  setLog(lines: readonly LogLine[], opacity: (line: LogLine) => number) {
    const key = lines.map((l) => `${l.error ? "!" : ""}${l.text}`).join("\n");
    if (key !== this.logKey) {
      this.logKey = key;
      this.log.replaceChildren(
        ...lines.map((l) => {
          const row = this.log.ownerDocument.createElement("div");
          row.textContent = l.text;
          row.style.cssText = `padding:1px 6px;margin-top:2px;border-radius:3px;background:rgba(${l.error ? "120,0,0" : "0,0,0"},.55);`;
          return row;
        }),
      );
    }
    lines.forEach((l, i) => {
      const row = this.log.children[i] as HTMLElement | undefined;
      if (row) row.style.opacity = String(opacity(l));
    });
  }

  /** Removes the debug DOM. */
  dispose() {
    this.panel.remove();
    this.log.remove();
  }
}
