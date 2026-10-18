import type { Layout } from "./layout";

/** The DOM the render plugin owns: a wrapper with the canvas and the logical-size overlay. */
export interface Stage {
  readonly canvas: HTMLCanvasElement;
  /** Absolutely positioned layer in logical units, scaled with a CSS transform. */
  readonly overlay: HTMLElement;
  /** CSS size of the container the game must fit in. */
  containerSize(): { width: number; height: number };
  /** Positions the canvas and overlay boxes for a layout; `bars` is the letterbox color. */
  place(layout: Layout, bars: string): void;
  /** Calls `fn` when the container changes size. Returns a function that stops it. */
  observe(fn: () => void): () => void;
  /** Removes everything and restores the styles that were changed. */
  dispose(): void;
}

/** Options for {@link createStage}. */
export interface StageOpts {
  root?: HTMLElement;
  canvas?: HTMLCanvasElement;
}

/**
 * Builds the DOM: `root > wrapper > canvas + overlay`. With `document.body`
 * as root the wrapper is `position: fixed; inset: 0`, so the game fills the
 * viewport. The canvas CSS box is exactly the drawn area; the wrapper
 * background is what shows in the letterbox bars.
 */
export function createStage(opts: StageOpts): Stage {
  const body = document.body;
  const root = opts.root ?? opts.canvas?.parentElement ?? body;
  const fullscreen = root === body;
  const canvas = opts.canvas ?? document.createElement("canvas");

  // Undo list for everything we touch outside our own elements.
  const undo: Array<() => void> = [];
  const touch = (el: HTMLElement) => {
    const css = el.style.cssText;
    undo.push(() => {
      el.style.cssText = css;
    });
  };
  if (fullscreen) {
    touch(body);
    body.style.margin = "0";
    body.style.overflow = "hidden";
  } else if (getComputedStyle(root).position === "static") {
    touch(root);
    root.style.position = "relative";
  }

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:${fullscreen ? "fixed" : "absolute"};inset:0;overflow:hidden;background:#000`;

  const prevParent = canvas.parentElement;
  const prevCanvasCss = canvas.style.cssText;
  canvas.style.cssText = "position:absolute;display:block";

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;overflow:hidden;pointer-events:none;user-select:none;transform-origin:0 0";

  wrapper.append(canvas, overlay);
  root.appendChild(wrapper);

  return {
    canvas,
    overlay,
    containerSize: () => ({ width: wrapper.clientWidth, height: wrapper.clientHeight }),
    place(layout, bars) {
      wrapper.style.background = bars;
      const cs = canvas.style;
      cs.left = `${layout.offsetX}px`;
      cs.top = `${layout.offsetY}px`;
      cs.width = `${layout.cssWidth}px`;
      cs.height = `${layout.cssHeight}px`;
      const os = overlay.style;
      os.left = `${layout.offsetX}px`;
      os.top = `${layout.offsetY}px`;
      os.width = `${layout.width}px`;
      os.height = `${layout.height}px`;
      os.transform = `scale(${layout.scaleX}, ${layout.scaleY})`;
    },
    observe(fn) {
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(fn);
        ro.observe(wrapper);
        return () => ro.disconnect();
      }
      window.addEventListener("resize", fn);
      return () => window.removeEventListener("resize", fn);
    },
    dispose() {
      wrapper.remove();
      if (opts.canvas) {
        // A canvas the user brought goes back where it was.
        canvas.style.cssText = prevCanvasCss;
        prevParent?.appendChild(canvas);
      }
      for (const fn of undo.reverse()) fn();
    },
  };
}
