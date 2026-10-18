import { Color, Vector3 } from "three";
import { definePlugin } from "../../core/engine.js";
import type { Engine, GameObj } from "../../core/types.js";
import { self } from "../../core/util.js";
import { applyFrame, type HudState, isAnchor } from "./placement.js";
import type { Anchor, HudAPI, RectOpts, TextComp, TextOpts, UIRectComp } from "./types.js";

export type * from "./types.js";

/** Readable over any 3D background: a thin dark outline plus a soft drop shadow. */
const OUTLINE =
  "-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 2px 4px rgba(0,0,0,.6)";

/** One live HUD element and what the HUD last wrote to it. */
interface Entry {
  obj: GameObj;
  el: HTMLElement;
  colorProp: "color" | "backgroundColor";
  state: HudState;
}

const _world = new Vector3();

/** `false` if the node or any ancestor is hidden. */
function isShown(node: GameObj["object3d"] | null): boolean {
  for (let n = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/**
 * Built-in plugin: DOM-based `text` and `uiRect` on the render overlay, fixed
 * to the screen (`fixed()`) or floating over a world position.
 */
export const hudPlugin = definePlugin<HudAPI>({
  name: "hud",
  dependencies: ["render", "transform"],
  install(k: Engine) {
    const entries = new Set<Entry>();

    /** Where the element goes this frame, and how it looks. */
    function update(entry: Entry) {
      const { obj, el } = entry;
      let visible = isShown(obj.object3d);
      let x = 0;
      let y = 0;
      if (visible) {
        if (obj.has("fixed")) {
          if (obj.has("pos")) {
            x = obj.pos.x;
            y = obj.pos.y;
          }
        } else {
          obj.object3d.updateWorldMatrix(true, false);
          const screen = k.toScreen(obj.object3d.getWorldPosition(_world));
          if (screen) {
            x = screen.x;
            y = screen.y;
          } else {
            visible = false; // behind the camera
          }
        }
      }
      applyFrame(el, entry.state, {
        visible,
        x,
        y,
        anchor: (obj.anchor as Anchor | undefined) ?? "topleft",
        opacity: typeof obj.opacity === "number" ? obj.opacity : undefined,
        color: obj.color instanceof Color ? obj.color : undefined,
        colorProp: entry.colorProp,
      });
    }

    // After the render plugin's hook: DOM work doesn't care that the frame is drawn.
    k.hooks.on("render", () => {
      for (const entry of entries) update(entry);
    });

    /** A positioned element for the overlay, or `null` when headless. Hidden until its first update. */
    function createElement(css: string): HTMLElement | null {
      if (typeof document === "undefined" || !k.overlay()) return null;
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;user-select:none;will-change:transform;display:none;${css}`;
      return el;
    }

    /** Puts an element on the overlay and under the HUD's care. */
    function mount(obj: GameObj, el: HTMLElement | null, colorProp: Entry["colorProp"]) {
      if (!el) return;
      k.overlay()?.appendChild(el);
      entries.add({ obj, el, colorProp, state: { display: "none" } });
    }

    function unmount(obj: GameObj, el: HTMLElement | null) {
      for (const entry of entries) if (entry.obj === obj) entries.delete(entry);
      el?.remove();
    }

    function text(str: string | number = "", opts: TextOpts = {}): TextComp {
      let content = String(str);
      let size = opts.size ?? 16;
      const css = [
        `font-family:${opts.font ?? "system-ui, sans-serif"}`,
        `font-size:${size}px`,
        `font-weight:${opts.weight ?? "normal"}`,
        `text-align:${opts.align ?? "left"}`,
        "line-height:1.2",
        "color:#fff",
        opts.width === undefined
          ? "white-space:pre"
          : `width:${opts.width}px;white-space:pre-wrap;overflow-wrap:break-word`,
        (opts.outline ?? true) ? `text-shadow:${OUTLINE}` : "",
      ].join(";");
      const el = createElement(css);
      if (el) el.textContent = content;
      return {
        id: "text",
        get text() {
          return content;
        },
        set text(v: string | number) {
          content = String(v);
          if (el && el.textContent !== content) el.textContent = content;
        },
        get textSize() {
          return size;
        },
        set textSize(v: number) {
          size = v;
          if (el) el.style.fontSize = `${v}px`;
        },
        el,
        add() {
          mount(self(this), el, "color");
        },
        destroy() {
          unmount(self(this), el);
        },
        inspect: () => JSON.stringify(content.length > 24 ? `${content.slice(0, 23)}…` : content),
      } as TextComp;
    }

    function uiRect(width: number, height: number, opts: RectOpts = {}): UIRectComp {
      let w = width;
      let h = height;
      const css = [
        `width:${w}px`,
        `height:${h}px`,
        "background-color:#fff",
        opts.radius === undefined ? "" : `border-radius:${opts.radius}px`,
        opts.outline ? `border:2px solid ${opts.outline};box-sizing:border-box` : "",
      ]
        .filter(Boolean)
        .join(";");
      const el = createElement(css);
      return {
        id: "uiRect",
        get width() {
          return w;
        },
        set width(v: number) {
          w = v;
          if (el) el.style.width = `${v}px`;
        },
        get height() {
          return h;
        },
        set height(v: number) {
          h = v;
          if (el) el.style.height = `${v}px`;
        },
        el,
        add() {
          mount(self(this), el, "backgroundColor");
        },
        destroy() {
          unmount(self(this), el);
        },
        inspect: () => `${w}x${h}`,
      } as UIRectComp;
    }

    function fixed() {
      return { id: "fixed" as const };
    }

    function anchor(a: Anchor) {
      if (!isAnchor(a)) {
        throw new Error(
          `Unknown anchor "${a}". Use topleft, top, topright, left, center, right, botleft, bot or botright.`,
        );
      }
      return { id: "anchor" as const, anchor: a };
    }

    return { text, uiRect, fixed, anchor, worldToHud: (world) => k.toScreen(world) };
  },
});
