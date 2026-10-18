import { Color, Vector2 } from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine } from "../../core/engine.js";
import type { Engine } from "../../core/types.js";
import { renderPlugin } from "../render/index.js";
import { shapesPlugin } from "../shapes/index.js";
import { transformPlugin } from "../transform/index.js";
import { hudPlugin } from "./index.js";
import {
  ANCHORS,
  applyFrame,
  cssColor,
  type HudState,
  hudTransform,
  isAnchor,
} from "./placement.js";

describe("placement", () => {
  it("anchors translate the element by a fraction of its own size", () => {
    expect(hudTransform(10, 20, "topleft")).toBe("translate(10px, 20px)");
    expect(hudTransform(10, 20, "center")).toBe("translate(10px, 20px) translate(-50%, -50%)");
    expect(hudTransform(0, 0, "botright")).toBe("translate(0px, 0px) translate(-100%, -100%)");
    expect(hudTransform(1.234, 5.678, "top")).toBe("translate(1.2px, 5.7px) translate(-50%, 0%)");
  });

  it("knows all nine anchors", () => {
    expect(Object.keys(ANCHORS)).toHaveLength(9);
    expect(isAnchor("botleft")).toBe(true);
    expect(isAnchor("middle")).toBe(false);
    expect(isAnchor("toString")).toBe(false);
  });

  it("applyFrame writes only what changed", () => {
    const el = { style: {} as Record<string, string> };
    const state: HudState = {};
    const frame = {
      visible: true,
      x: 5,
      y: 6,
      anchor: "topleft" as const,
      opacity: 0.5,
      color: new Color("#ff0000"),
      colorProp: "color" as const,
    };
    applyFrame(el, state, frame);
    expect(el.style).toMatchObject({
      display: "",
      transform: "translate(5px, 6px)",
      opacity: "0.5",
      color: "#ff0000",
    });
    el.style.transform = "touched";
    applyFrame(el, state, frame); // nothing changed: no write
    expect(el.style.transform).toBe("touched");
    applyFrame(el, state, { ...frame, x: 7 });
    expect(el.style.transform).toBe("translate(7px, 6px)");
  });

  it("applyFrame hides and skips the rest, and clamps opacity", () => {
    const el = { style: {} as Record<string, string> };
    const state: HudState = {};
    applyFrame(el, state, { visible: false, x: 1, y: 1, anchor: "top", colorProp: "color" });
    expect(el.style).toEqual({ display: "none" });
    applyFrame(el, state, {
      visible: true,
      x: 0,
      y: 0,
      anchor: "topleft",
      opacity: 3,
      color: new Color(0, 0, 1),
      colorProp: "backgroundColor",
    });
    expect(el.style.opacity).toBe("1");
    expect(el.style.backgroundColor).toBe(cssColor(new Color(0, 0, 1)));
  });
});

// A DOM just big enough for the HUD: elements with a style bag and an overlay that holds them.
interface FakeEl {
  style: Record<string, string>;
  textContent: string;
  parent: FakeOverlay | null;
  remove(): void;
}
interface FakeOverlay {
  children: FakeEl[];
  appendChild(el: FakeEl): void;
}

describe("hud plugin", () => {
  let overlay: FakeOverlay;
  let visibleToScreen = true;

  beforeEach(() => {
    visibleToScreen = true;
    overlay = {
      children: [],
      appendChild(el) {
        el.parent = overlay;
        overlay.children.push(el);
      },
    };
    (globalThis as { document?: unknown }).document = {
      createElement: (): FakeEl => {
        const el: FakeEl = {
          style: {},
          textContent: "",
          parent: null,
          remove() {
            if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
            el.parent = null;
          },
        };
        return el;
      },
    };
  });
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  // The real render plugin is headless in Node, so a stub provides the overlay and projection.
  const stubRender = {
    name: "render",
    install: () => ({
      overlay: () => overlay,
      toScreen: (v: { x: number; y: number }) =>
        visibleToScreen ? new Vector2(v.x * 10, v.y * 10) : null,
    }),
  };
  const make = () =>
    createEngine({ loop: "manual" }, [
      stubRender,
      transformPlugin,
      shapesPlugin,
      hudPlugin,
    ]) as Engine;
  const elOf = (o: { el: unknown }) => o.el as FakeEl;

  it("text() creates an element on the overlay, hidden until the first frame", () => {
    const k = make();
    const o = k.add([k.text("hello", { size: 20 }), k.fixed()]);
    expect(overlay.children).toEqual([elOf(o)]);
    expect(elOf(o).textContent).toBe("hello");
    expect(elOf(o).style.cssText).toContain("font-size:20px");
    expect(elOf(o).style.cssText).toContain("system-ui, sans-serif");
    expect(elOf(o).style.cssText).toContain("text-shadow");
    expect(elOf(o).style.cssText).toContain("display:none");
    k.step(0.016);
    expect(elOf(o).style.display).toBe("");
  });

  it("outline: false removes the shadow; width wraps", () => {
    const k = make();
    const o = k.add([k.text("x", { outline: false, width: 100, align: "center" })]);
    expect(elOf(o).style.cssText).not.toContain("text-shadow");
    expect(elOf(o).style.cssText).toContain("width:100px");
    expect(elOf(o).style.cssText).toContain("text-align:center");
  });

  it("setting obj.text and textSize updates the element", () => {
    const k = make();
    const o = k.add([k.text("a"), k.fixed()]);
    o.text = "score: 5";
    expect(elOf(o).textContent).toBe("score: 5");
    expect(o.text).toBe("score: 5");
    (o as { text: unknown }).text = 7; // numbers are accepted at runtime
    expect(o.text).toBe("7");
    o.textSize = 32;
    expect(elOf(o).style.fontSize).toBe("32px");
  });

  it("fixed() positions from pos in logical pixels, with anchor", () => {
    const k = make();
    const o = k.add([k.text("hp"), k.fixed(), k.pos(100, 50), k.anchor("topright")]);
    k.step(0.016);
    expect(elOf(o).style.transform).toBe("translate(100px, 50px) translate(-100%, 0%)");
    o.pos.x = 120;
    k.step(0.016);
    expect(elOf(o).style.transform).toContain("translate(120px, 50px)");
  });

  it("fixed() without pos sits at (0, 0)", () => {
    const k = make();
    const o = k.add([k.text("hi"), k.fixed()]);
    k.step(0.016);
    expect(elOf(o).style.transform).toBe("translate(0px, 0px)");
  });

  it("without fixed() the label floats over the world position and hides behind the camera", () => {
    const k = make();
    const o = k.add([k.text("enemy"), k.pos(3, 2, 0)]);
    k.step(0.016);
    expect(elOf(o).style.transform).toBe("translate(30px, 20px)");
    visibleToScreen = false;
    k.step(0.016);
    expect(elOf(o).style.display).toBe("none");
    visibleToScreen = true;
    k.step(0.016);
    expect(elOf(o).style.display).toBe("");
  });

  it("follows parents when floating", () => {
    const k = make();
    const parent = k.add([k.pos(10, 0, 0)]);
    const o = parent.add([k.text("x"), k.pos(1, 0, 0)]);
    k.step(0.016);
    expect(elOf(o).style.transform).toBe("translate(110px, 0px)");
  });

  it("reads color, opacity and hidden every frame", () => {
    const k = make();
    const o = k.add([k.text("x"), k.fixed(), k.color("#ff0000"), k.opacity(0.5)]);
    k.step(0.016);
    expect(elOf(o).style.color).toBe("#ff0000");
    expect(elOf(o).style.opacity).toBe("0.5");
    o.color.set("#00ff00");
    o.opacity = 0.25;
    k.step(0.016);
    expect(elOf(o).style.color).toBe("#00ff00");
    expect(elOf(o).style.opacity).toBe("0.25");
    o.hidden = true;
    k.step(0.016);
    expect(elOf(o).style.display).toBe("none");
  });

  it("a hidden parent hides the label", () => {
    const k = make();
    const parent = k.add([]);
    const o = parent.add([k.text("x"), k.fixed()]);
    k.step(0.016);
    expect(elOf(o).style.display).toBe("");
    parent.hidden = true;
    k.step(0.016);
    expect(elOf(o).style.display).toBe("none");
  });

  it("uiRect: size, fill color, setters", () => {
    const k = make();
    const bar = k.add([
      k.uiRect(200, 20, { radius: 4, outline: "#fff" }),
      k.fixed(),
      k.pos(10, 10),
      k.color("#00ff00"),
    ]);
    expect(elOf(bar).style.cssText).toContain("width:200px");
    expect(elOf(bar).style.cssText).toContain("border-radius:4px");
    expect(elOf(bar).style.cssText).toContain("border:2px solid #fff");
    k.step(0.016);
    expect(elOf(bar).style.backgroundColor).toBe("#00ff00");
    expect(elOf(bar).style.transform).toBe("translate(10px, 10px)");
    bar.width = 100;
    expect(elOf(bar).style.width).toBe("100px");
    expect(bar.width).toBe(100);
  });

  it("removes the element on destroy and on scene change", () => {
    const k = make();
    const o = k.add([k.text("x"), k.fixed()]);
    k.step(0.016);
    o.destroy();
    expect(overlay.children).toHaveLength(0);
    k.scene("s", () => {
      k.add([k.text("y"), k.fixed()]);
    });
    k.go("s");
    expect(overlay.children).toHaveLength(1);
    k.scene("t", () => {});
    k.go("t");
    expect(overlay.children).toHaveLength(0);
    k.step(0.016); // no dangling entries to update
  });

  it("anchor() rejects unknown anchors, naming the valid ones", () => {
    const k = make();
    expect(() => k.anchor("middle" as never)).toThrow(/botleft/);
  });

  it("worldToHud is toScreen", () => {
    const k = make();
    expect(k.worldToHud(new k.THREE.Vector3(1, 2, 3))!.toArray()).toEqual([10, 20]);
  });
});

describe("hud plugin, headless", () => {
  const make = () =>
    createEngine({ loop: "manual", renderer: "none" }, [
      renderPlugin,
      transformPlugin,
      shapesPlugin,
      hudPlugin,
    ]) as Engine;

  it("keeps text and uiRect working without a DOM", () => {
    const k = make();
    const t = k.add([k.text("score 0"), k.fixed(), k.pos(10, 10)]);
    expect(t.el).toBeNull();
    t.text = "score 1";
    expect(t.text).toBe("score 1");
    const r = k.add([k.uiRect(100, 10), k.fixed()]);
    expect(r.el).toBeNull();
    r.width = 50;
    expect(r.width).toBe(50);
    k.step(0.016);
    t.destroy();
  });
});
