import { BoxGeometry, Mesh, MeshBasicMaterial, Ray, Vector2, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../core/engine";
import type { Engine, PluginLike } from "../../core/types";
import { physicsPlugin } from "../physics";
import { renderPlugin } from "../render";
import { transformPlugin } from "../transform";
import { debugPlugin } from ".";
import { FpsMeter } from "./fps";
import { describeObject } from "./inspect";
import { formatMessage, LogBuffer } from "./log";
import { DebugUI } from "./panel";

/** Stands in for the input plugin: records the keys the debug plugin listens to. */
function fakeInput(presses: Array<{ key: string; fn: () => void }>): PluginLike {
  return {
    name: "input",
    install: () => ({
      onKeyPress(key: string, fn: () => void) {
        presses.push({ key, fn });
        return { paused: false, cancel() {} };
      },
    }),
  };
}

const make = (opts: Record<string, unknown> = {}, extra: PluginLike[] = []) =>
  createEngine({ loop: "manual", renderer: "none", ...opts }, [
    renderPlugin,
    transformPlugin,
    ...extra,
    debugPlugin,
  ]) as Engine;

afterEach(() => vi.restoreAllMocks());

describe("debug object", () => {
  it("paused and timeScale mirror the engine", () => {
    const k = make();
    k.debug.paused = true;
    expect(k.isPaused()).toBe(true);
    k.setPaused(false);
    expect(k.debug.paused).toBe(false);
    k.debug.timeScale = 0.5;
    expect(k.getTimeScale()).toBe(0.5);
    k.setTimeScale(2);
    expect(k.debug.timeScale).toBe(2);
  });

  it("objectCount counts every live object", () => {
    const k = make();
    expect(k.debug.objectCount()).toBe(0);
    const a = k.add([]);
    a.add([]);
    expect(k.debug.objectCount()).toBe(2);
    a.destroy();
    expect(k.debug.objectCount()).toBe(0);
  });

  it("inspect emits the debugInspect hook only on change", () => {
    const k = make();
    const seen: boolean[] = [];
    k.hooks.on("debugInspect", (on) => seen.push(on));
    k.debug.inspect = true;
    k.debug.inspect = true;
    k.debug.inspect = false;
    expect(seen).toEqual([true, false]);
  });

  it("opts.debug starts with the inspector on", () => {
    expect(make({ debug: true }).debug.inspect).toBe(true);
    expect(make().debug.inspect).toBe(false);
  });
});

describe("debug key", () => {
  it("toggles inspect with F1 by default", () => {
    const presses: Array<{ key: string; fn: () => void }> = [];
    const k = make({}, [fakeInput(presses)]);
    expect(presses.map((p) => p.key)).toEqual(["f1"]);
    presses[0].fn();
    expect(k.debug.inspect).toBe(true);
    presses[0].fn();
    expect(k.debug.inspect).toBe(false);
  });

  it("can be changed or disabled", () => {
    const a: Array<{ key: string; fn: () => void }> = [];
    make({ debugKey: "f3" }, [fakeInput(a)]);
    expect(a.map((p) => p.key)).toEqual(["f3"]);
    const b: Array<{ key: string; fn: () => void }> = [];
    make({ debugKey: false }, [fakeInput(b)]);
    expect(b).toEqual([]);
  });

  it("works without an input plugin", () => {
    expect(() => make()).not.toThrow();
  });
});

describe("fps", () => {
  it("smooths real frame times measured with performance.now()", () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const k = make();
    expect(k.debug.fps()).toBe(0);
    k.step(0.016);
    expect(k.debug.fps()).toBe(0); // needs two frames
    now += 20;
    k.step(0.016);
    expect(k.debug.fps()).toBeCloseTo(50);
    now += 10; // 100 fps sample, smoothed towards it
    k.step(0.016);
    expect(k.debug.fps()).toBeCloseTo(55);
  });

  it("keeps counting while the game is paused", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const k = make();
    k.debug.paused = true;
    k.step(0.016);
    now += 25;
    k.step(0.016);
    expect(k.debug.fps()).toBeCloseTo(40);
  });

  it("FpsMeter ignores non-advancing clocks", () => {
    const m = new FpsMeter();
    expect(m.tick(5)).toBe(0);
    expect(m.tick(5)).toBe(0);
    expect(m.value).toBe(0);
    expect(m.tick(105)).toBeCloseTo(0.1);
    expect(m.value).toBeCloseTo(10);
  });
});

describe("log", () => {
  it("prints to the console and keeps lines that fade out after ~4 s", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const k = make();
    k.debug.log("hello", { a: 1 });
    k.debug.error("boom");
    expect(log).toHaveBeenCalledWith("hello", { a: 1 });
    expect(err).toHaveBeenCalledWith("boom");
    k.debug.clearLog(); // must not throw headless
  });

  it("LogBuffer ages, fades, caps and clears", () => {
    const b = new LogBuffer(4, 1, 3);
    b.push("a");
    b.tick(2);
    b.push("b", true);
    expect(b.opacity(b.lines[0])).toBe(1);
    b.tick(1.5); // a: 3.5 s old
    expect(b.opacity(b.lines[0])).toBeCloseTo(0.5);
    expect(b.opacity(b.lines[1])).toBe(1);
    b.tick(0.5); // a expires
    expect(b.lines.map((l) => l.text)).toEqual(["b"]);
    for (const t of ["c", "d", "e"]) b.push(t);
    expect(b.lines.map((l) => l.text)).toEqual(["c", "d", "e"]);
    b.clear();
    expect(b.lines).toEqual([]);
  });

  it("formatMessage joins strings, objects and errors", () => {
    expect(formatMessage(["a", 1, { x: 2 }, null])).toBe('a 1 {"x":2} null');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatMessage([circular])).toBe("[object Object]");
    expect(formatMessage([new Error("bad")])).toContain("bad");
  });
});

describe("inspector", () => {
  const helpers = (k: Engine) => k.scene3d.children.find((c) => c.name === "threeplay-debug");

  function meshComp() {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    return {
      mesh,
      add(this: { object3d: { add(m: Mesh): void } }) {
        this.object3d.add(mesh);
      },
    };
  }

  it("outlines objects with a mesh while on (no physics plugin) and cleans up", () => {
    const k = make();
    const a = k.add([k.pos(0, 0, 0), meshComp()]);
    k.add([k.pos(5, 0, 0)]); // no mesh: no box
    k.debug.inspect = true;
    const group = helpers(k)!;
    expect(group.children.length).toBe(1);
    const box = group.children[0] as unknown as { box: { min: Vector3; max: Vector3 } };
    expect(box.box.max.x).toBeCloseTo(1);
    a.pos.x = 10;
    k.step(0.016);
    expect(box.box.min.x).toBeCloseTo(9);
    a.destroy();
    k.step(0.016);
    expect(group.children.length).toBe(0);
    k.debug.inspect = false;
    expect(helpers(k)).toBeUndefined();
  });

  it("draws nothing while off", () => {
    const k = make();
    k.add([meshComp()]);
    k.step(0.016);
    expect(helpers(k)).toBeUndefined();
  });

  it("leaves the boxes to physics when there is a physics plugin", () => {
    const k = createEngine({ loop: "manual", renderer: "none" }, [
      renderPlugin,
      transformPlugin,
      { name: "physics", install: () => ({}) },
      debugPlugin,
    ]) as Engine;
    k.add([meshComp()]);
    k.debug.inspect = true;
    k.step(0.016);
    expect(helpers(k)).toBeUndefined();
  });

  it("outlines meshes with physics: false (the inert physics draws no colliders)", () => {
    const k = createEngine({ loop: "manual", renderer: "none", physics: false }, [
      renderPlugin,
      transformPlugin,
      physicsPlugin,
      debugPlugin,
    ]) as Engine;
    k.add([meshComp()]);
    k.debug.inspect = true;
    k.step(0.016);
    expect(helpers(k)?.children.length).toBe(1);
  });

  it("prevents the browser default of the debug key on the canvas", () => {
    const canvas = new EventTarget() as unknown as HTMLCanvasElement;
    const render: PluginLike = {
      name: "render",
      install: () => ({ canvas, overlay: () => null }),
    };
    const k = createEngine({ loop: "manual", renderer: "none" }, [
      render,
      transformPlugin,
      fakeInput([]),
      debugPlugin,
    ]) as Engine;
    const send = (key: string) => {
      const e = Object.assign(new Event("keydown", { cancelable: true }), { key });
      canvas.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(send("F1")).toBe(true);
    expect(send("a")).toBe(false);
    k.quit();
    expect(send("F1")).toBe(false);
  });

  it("hovered() picks the nearest visible object under the mouse ray", () => {
    const k = make();
    const near = k.add([k.pos(0, 0, -5), meshComp(), "near"]);
    k.add([k.pos(0, 0, -10), meshComp(), "far"]);
    k.root.object3d.updateMatrixWorld(true);
    Object.defineProperty(k, "mousePos", { value: () => new Vector2(), configurable: true });
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
    Object.defineProperty(k, "screenRay", { value: () => ray, configurable: true });
    expect(k.debug.hovered()).toBe(near);
    near.hidden = true;
    expect(k.debug.hovered()?.is("far")).toBe(true);
    ray.direction.set(0, 1, 0);
    expect(k.debug.hovered()).toBeNull();
  });

  it("hovered() is null without input/render support", () => {
    expect(make().debug.hovered()).toBeNull();
  });

  it("describeObject lists id, tags and component inspect lines", () => {
    const k = make();
    const o = k.add([k.pos(1, 2, 3), "enemy", "solid"]);
    expect(describeObject(o)).toEqual([`#${o.id} [enemy, solid]`, "  pos: (1.00, 2.00, 3.00)"]);
    expect(describeObject(k.add([]))[0]).toMatch(/^#\d+$/);
  });
});

// --- the DOM bits, against a tiny fake document ---

class FakeEl {
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  textContent = "";
  removed = false;
  ownerDocument = { createElement: () => new FakeEl() };
  append(...els: FakeEl[]) {
    this.children.push(...els);
  }
  replaceChildren(...els: FakeEl[]) {
    this.children = els;
  }
  remove() {
    this.removed = true;
  }
}

describe("DebugUI", () => {
  const make2 = () => {
    const overlay = new FakeEl();
    const ui = new DebugUI(overlay as unknown as HTMLElement);
    const [panel, log] = overlay.children;
    return { ui, panel, log, overlay };
  };

  it("shows the panel and updates its text", () => {
    const { ui, panel } = make2();
    expect(panel.style.display).toBe("none");
    ui.setPanelVisible(true);
    expect(panel.style.display).toBe("block");
    ui.setPanelText("FPS 60");
    expect(panel.textContent).toBe("FPS 60");
  });

  it("draws log rows with their own opacity", () => {
    const { ui, log } = make2();
    const lines = [
      { text: "one", error: false, age: 0 },
      { text: "two", error: true, age: 3.5 },
    ];
    ui.setLog(lines, (l) => (l.age > 3 ? 0.5 : 1));
    expect(log.children.map((c) => c.textContent)).toEqual(["one", "two"]);
    expect(log.children.map((c) => c.style.opacity)).toEqual(["1", "0.5"]);
    ui.setLog([], () => 1);
    expect(log.children.length).toBe(0);
  });

  it("dispose removes its elements", () => {
    const { ui, panel, log } = make2();
    ui.dispose();
    expect(panel.removed && log.removed).toBe(true);
  });
});
