// @vitest-environment happy-dom
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createEngine, definePlugin } from "../../core/engine";
import type { Engine } from "../../core/types";
import type { RenderAPI } from "../render/types";
import { transformPlugin } from "../transform";
import { inputPlugin } from ".";

/**
 * A stand-in for the render plugin: a real DOM canvas and a camera ray that
 * always shoots from (0, 0, 10) towards −Z, whatever the screen point is.
 */
function fakeRender(scale = 1, size?: { width: number; height: number }) {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const plugin = definePlugin<Partial<RenderAPI>>({
    name: "render",
    install: () => ({
      canvas,
      viewScale: () => scale,
      ...(size && { width: () => size.width, height: () => size.height }),
      center: () => new THREE.Vector2(400, 300),
      screenRay: () => new THREE.Ray(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1)),
    }),
  });
  return { canvas, plugin };
}

function make(scale = 1) {
  const { canvas, plugin } = fakeRender(scale);
  const k = createEngine({ loop: "manual" }, [plugin, transformPlugin, inputPlugin]) as Engine;
  return { k, canvas };
}

const key = (type: "keydown" | "keyup", init: KeyboardEventInit) =>
  new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });

describe("input plugin on a DOM canvas", () => {
  it("makes the canvas focusable and focuses it when the engine is loaded", () => {
    const { canvas, k } = make();
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.style.outline).toMatch(/^none/);
    k.step(0.016);
    expect(document.activeElement).toBe(canvas);
  });

  it("reads keyboard events dispatched on the canvas (kaplay-style forwarding)", () => {
    const { canvas, k } = make();
    const log: string[] = [];
    k.onKeyPress("left", (key) => log.push(`press ${key}`));
    k.onKeyRelease((key) => log.push(`release ${key}`));
    k.onKeyDown("space", () => log.push("down space"));
    canvas.dispatchEvent(key("keydown", { key: "ArrowLeft" }));
    canvas.dispatchEvent(key("keydown", { key: " " }));
    expect(k.isKeyDown("left")).toBe(false); // queued until the next frame
    k.step(0.016);
    expect(k.isKeyDown("left")).toBe(true);
    expect(k.isKeyDown(["a", "space"])).toBe(true);
    expect(k.isButtonDown(["left", "jump"])).toBe(true); // default bindings
    canvas.dispatchEvent(key("keyup", { key: "ArrowLeft" }));
    k.step(0.016);
    expect(k.isKeyDown("left")).toBe(false);
    expect(log).toEqual(["press left", "down space", "release left", "down space"]);
  });

  it("prevents the default of scrolling keys but not of combos or F-keys", () => {
    const { canvas } = make();
    const send = (init: KeyboardEventInit) => {
      const e = key("keydown", init);
      canvas.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(send({ key: "ArrowDown" })).toBe(true);
    expect(send({ key: " " })).toBe(true);
    expect(send({ key: "Tab" })).toBe(true);
    expect(send({ key: "Backspace" })).toBe(true);
    expect(send({ key: "F5" })).toBe(false);
    expect(send({ key: "a" })).toBe(false);
    expect(send({ key: "ArrowLeft", metaKey: true })).toBe(false);
  });

  it("keeps pressed for one frame, even if the key went up in the same frame", () => {
    const { canvas, k } = make();
    const seen: boolean[] = [];
    k.onUpdate(() => seen.push(k.isKeyPressed("x"), k.isKeyReleased("x"), k.isKeyDown("x")));
    canvas.dispatchEvent(key("keydown", { key: "x" }));
    canvas.dispatchEvent(key("keyup", { key: "x" }));
    k.step(0.016);
    expect(seen).toEqual([true, true, false]);
  });

  it("repeats: key repeat does not press again but feeds onKeyPressRepeat", () => {
    const { canvas, k } = make();
    const presses: string[] = [];
    const repeats: string[] = [];
    k.onKeyPress("a", (x) => presses.push(x));
    k.onKeyPressRepeat("a", (x) => repeats.push(x));
    canvas.dispatchEvent(key("keydown", { key: "a" }));
    canvas.dispatchEvent(key("keydown", { key: "a", repeat: true }));
    canvas.dispatchEvent(key("keydown", { key: "a", repeat: true }));
    k.step(0.016);
    expect(presses).toEqual(["a"]);
    expect(repeats).toEqual(["a", "a", "a"]);
  });

  it("sends typed characters to onCharInput", () => {
    const { canvas, k } = make();
    const typed: string[] = [];
    k.onCharInput((c) => typed.push(c));
    canvas.dispatchEvent(key("keydown", { key: "H" }));
    canvas.dispatchEvent(key("keydown", { key: "Enter" }));
    canvas.dispatchEvent(key("keydown", { key: "c", ctrlKey: true }));
    k.step(0.016);
    expect(typed).toEqual(["H"]);
  });

  it("releases everything on window blur", () => {
    const { canvas, k } = make();
    const released: string[] = [];
    k.onKeyRelease((x) => released.push(x));
    canvas.dispatchEvent(key("keydown", { key: "w" }));
    k.step(0.016);
    expect(k.isButtonDown("up")).toBe(true);
    window.dispatchEvent(new Event("blur"));
    k.step(0.016);
    expect(k.isKeyDown("w")).toBe(false);
    expect(k.isButtonDown("up")).toBe(false);
    expect(released).toEqual(["w"]);
  });

  it("converts the mouse position to logical units", () => {
    const { canvas, k } = make(2);
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 210, clientY: 120 }));
    k.step(0.016);
    expect(k.mousePos().toArray()).toEqual([100, 50]);
  });

  it("presses mouse buttons, accumulates the movement delta and resets it per frame", () => {
    const { canvas, k } = make();
    const events: string[] = [];
    k.onMousePress("right", () => events.push("right press"));
    k.onMouseRelease(() => events.push("release"));
    const deltas: number[][] = [];
    k.onUpdate(() => deltas.push(k.mouseDeltaPos().toArray()));
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: 5, clientY: 5 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 8, clientY: 5, movementX: 3 }));
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 10, clientY: 9, movementX: 2, movementY: 4 }),
    );
    k.step(0.016);
    expect(k.isMouseDown("right")).toBe(true);
    expect(deltas[0]).toEqual([5, 4]);
    window.dispatchEvent(new MouseEvent("mouseup", { button: 2 }));
    k.step(0.016);
    expect(deltas[1]).toEqual([0, 0]);
    expect(k.isMouseDown("right")).toBe(false);
    expect(events).toEqual(["right press", "release"]);
  });

  it("virtual buttons can be bound to the mouse", () => {
    const { canvas, k } = make();
    k.setButton("fire", { mouse: "left" });
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    k.step(0.016);
    expect(k.isButtonDown("fire")).toBe(true);
  });

  it("scroll deltas reach onScroll and the wheel does not scroll the page", () => {
    const { canvas, k } = make();
    const seen: number[] = [];
    k.onScroll((d) => seen.push(d.y));
    const wheel = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
    canvas.dispatchEvent(wheel);
    k.step(0.016);
    expect(seen).toEqual([100]);
    expect(wheel.defaultPrevented).toBe(true);
  });

  it("lockPointer asks the canvas and swallows a rejected promise", async () => {
    const { canvas, k } = make();
    canvas.requestPointerLock = vi.fn(() => Promise.reject(new Error("no gesture"))) as never;
    k.lockPointer();
    expect(canvas.requestPointerLock).toHaveBeenCalled();
    await Promise.resolve(); // an unhandled rejection would fail the run
    expect(k.isPointerLocked()).toBe(false);
  });

  it("touch: logical positions, and the first finger acts as the left mouse button", () => {
    const { canvas, k } = make();
    const seen: string[] = [];
    k.onTouchStart((p) => seen.push(`start ${p.x},${p.y}`));
    k.onTouchEnd(() => seen.push("end"));
    k.onMousePress(() => seen.push("mouse press"));
    const touch = { identifier: 1, clientX: 30, clientY: 40 } as Touch;
    const fire = (type: string) => {
      const e = new Event(type, { cancelable: true }) as Event & { changedTouches: Touch[] };
      e.changedTouches = [touch];
      canvas.dispatchEvent(e);
    };
    fire("touchstart");
    k.step(0.016);
    expect(k.isTouchscreen()).toBe(true);
    expect(k.isMouseDown()).toBe(true);
    fire("touchend");
    k.step(0.016);
    expect(k.isMouseDown()).toBe(false);
    expect(seen).toEqual(["start 30,40", "mouse press", "end"]);
  });

  describe("raycasts", () => {
    const addBox = (k: Engine, tags: string[], z = 0) => {
      const obj = k.add([...tags, k.pos(0, 0, z)]);
      obj.object3d.add(
        new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()),
      );
      return obj;
    };

    it("onClick(tag) hands over the tagged object under the cursor", () => {
      const { canvas, k } = make();
      const enemy = addBox(k, ["enemy"]);
      const clicked: unknown[] = [];
      k.onClick("enemy", (o) => clicked.push(o));
      k.onClick("friend", () => clicked.push("friend"));
      let any = 0;
      k.onClick(() => any++);
      canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
      k.step(0.016);
      expect(clicked).toEqual([enemy]);
      expect(any).toBe(1);
    });

    it("walks up to the tagged parent of the mesh that was hit", () => {
      const { canvas, k } = make();
      const parent = k.add(["enemy", k.pos()]);
      const child = parent.add([k.pos()]);
      child.object3d.add(
        new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()),
      );
      const clicked: unknown[] = [];
      k.onClick("enemy", (o) => clicked.push(o));
      canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
      k.step(0.016);
      expect(clicked).toEqual([parent]);
    });

    it("only the nearest hit counts, hidden objects are skipped and misses do nothing", () => {
      const { canvas, k } = make();
      const far = addBox(k, ["far"], -5);
      const near = addBox(k, ["near"], 5);
      const hits: string[] = [];
      k.onClick("far", () => hits.push("far"));
      k.onClick("near", () => hits.push("near"));
      const click = () => {
        canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
        k.step(0.016);
        window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
        k.step(0.016);
      };
      click();
      expect(hits).toEqual(["near"]);
      near.hidden = true;
      click();
      expect(hits).toEqual(["near", "far"]);
      far.destroy();
      click();
      expect(hits).toEqual(["near", "far"]);
    });

    it("onHover / onHoverEnd follow the cursor, once per frame", () => {
      const { k } = make();
      const box = addBox(k, ["thing"]);
      const log: string[] = [];
      k.onHover("thing", () => log.push("in"));
      k.onHoverEnd("thing", () => log.push("out"));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1, clientY: 1 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 2, clientY: 2 }));
      k.step(0.016);
      expect(log).toEqual(["in"]);
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 3, clientY: 3 }));
      k.step(0.016);
      expect(log).toEqual(["in"]); // still over it: no repeat
      box.pos.x = 50;
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 4, clientY: 4 }));
      k.step(0.016);
      expect(log).toEqual(["in", "out"]);
    });

    it("cancelled click listeners stop costing a raycast", () => {
      const { canvas, k } = make();
      addBox(k, ["thing"]);
      const spy = vi.spyOn(THREE.Raycaster.prototype, "intersectObject");
      const ctrl = k.onClick("thing", () => {});
      canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
      k.step(0.016);
      expect(spy).toHaveBeenCalledTimes(1);
      ctrl.cancel();
      window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
      canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
      k.step(0.016);
      k.step(0.016);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  it("stops listening when the engine quits", () => {
    const { canvas, k } = make();
    k.quit();
    canvas.dispatchEvent(key("keydown", { key: "a" }));
    k.step(0.016);
    expect(k.isKeyDown("a")).toBe(false);
  });

  it("maps the mouse per axis from the canvas box when the view is stretched", () => {
    const { canvas, plugin } = fakeRender(2, { width: 400, height: 300 });
    const k = createEngine({ loop: "manual" }, [plugin, transformPlugin, inputPlugin]) as Engine;
    // 800x300 CSS px for a 400x300 logical view: X scale 2, Y scale 1
    canvas.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 800, height: 300 }) as DOMRect;
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 210, clientY: 120 }));
    k.step(0.016);
    expect(k.mousePos().toArray()).toEqual([100, 100]);
  });

  it("releases held keys when the canvas loses focus or the tab is hidden", () => {
    for (const type of ["blur", "focusout"]) {
      const { canvas, k } = make();
      canvas.dispatchEvent(key("keydown", { key: "w" }));
      k.step(0.016);
      expect(k.isKeyDown("w")).toBe(true);
      canvas.dispatchEvent(new FocusEvent(type));
      k.step(0.016);
      expect(k.isKeyDown("w")).toBe(false);
    }
    const { canvas, k } = make();
    canvas.dispatchEvent(key("keydown", { key: "w" }));
    k.step(0.016);
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    hidden.mockRestore();
    k.step(0.016);
    expect(k.isKeyDown("w")).toBe(false);
  });

  it("coalesces mouse moves and caps the queue while the loop is not running", () => {
    const { canvas, k } = make();
    const moves: number[][] = [];
    k.onMouseMove((pos, delta) => moves.push([pos.x, delta.x]));
    for (let i = 1; i <= 2000; i++) {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: i, clientY: 0, movementX: 1 }));
    }
    k.step(0.016);
    expect(moves).toEqual([[2000, 2000]]); // one entry, deltas summed
    // other events are capped (oldest dropped), the newest survive
    const presses: string[] = [];
    k.onKeyPress((key) => presses.push(key));
    for (let i = 0; i < 1000; i++) canvas.dispatchEvent(key("keydown", { key: "a", repeat: true }));
    canvas.dispatchEvent(key("keydown", { key: "z" }));
    k.step(0.016);
    expect(presses.at(-1)).toBe("z");
  });
});
