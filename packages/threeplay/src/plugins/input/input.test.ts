import { Vector3 } from "three";
import { afterEach, describe, expect, it } from "vitest";
import { createEngine } from "../../core/engine.js";
import type { Engine } from "../../core/types.js";
import { renderPlugin } from "../render/index.js";
import { transformPlugin } from "../transform/index.js";
import { inputToWorld } from "./dir.js";
import { applyDeadZone, readGamepads } from "./gamepad.js";
import { inputPlugin } from "./index.js";
import { normalizeKey, shouldPreventDefault } from "./keys.js";
import { isBindingDown, PressState } from "./state.js";

const make = (opts: Record<string, unknown> = {}) =>
  createEngine({ loop: "manual", renderer: "none", ...opts }, [
    renderPlugin,
    transformPlugin,
    inputPlugin,
  ]) as Engine;

describe("key names", () => {
  it("normalizes like kaplay", () => {
    expect(normalizeKey("ArrowLeft")).toBe("left");
    expect(normalizeKey("ArrowUp")).toBe("up");
    expect(normalizeKey(" ")).toBe("space");
    expect(normalizeKey("Escape")).toBe("escape");
    expect(normalizeKey("Enter")).toBe("enter");
    expect(normalizeKey("Shift")).toBe("shift");
    expect(normalizeKey("Control")).toBe("control");
    expect(normalizeKey("F1")).toBe("f1");
    expect(normalizeKey("A")).toBe("a");
  });

  it("reads shifted digits by their code", () => {
    expect(normalizeKey("!", "Digit1")).toBe("1");
    expect(normalizeKey("a", "KeyA")).toBe("a");
  });

  it("prevents default only for page-scrolling keys without ctrl/meta", () => {
    for (const key of ["left", "right", "up", "down", "space", "tab", "backspace"]) {
      expect(shouldPreventDefault(key)).toBe(true);
    }
    expect(shouldPreventDefault("f5")).toBe(false);
    expect(shouldPreventDefault("a")).toBe(false);
    expect(shouldPreventDefault("left", { metaKey: true })).toBe(false);
    expect(shouldPreventDefault("space", { ctrlKey: true })).toBe(false);
  });
});

describe("PressState", () => {
  it("tracks down / pressed / released", () => {
    const s = new PressState<string>();
    expect(s.press("a")).toBe(true);
    expect(s.press("a")).toBe(false);
    expect([...s.down]).toEqual(["a"]);
    expect(s.pressed.has("a")).toBe(true);
    s.endFrame();
    expect(s.pressed.size).toBe(0);
    expect(s.down.has("a")).toBe(true);
    expect(s.release("a")).toBe(true);
    expect(s.release("a")).toBe(false);
    expect(s.released.has("a")).toBe(true);
  });

  it("a press and release in one frame is both pressed and released", () => {
    const s = new PressState<string>();
    s.press("a");
    s.release("a");
    expect(s.pressed.has("a") && s.released.has("a")).toBe(true);
    expect(s.down.has("a")).toBe(false);
  });
});

describe("binding resolution", () => {
  const src = (keys: string[], mouse: string[] = [], pad: string[] = []) => ({
    keyDown: (k: string) => keys.includes(k),
    mouseDown: (b: string) => mouse.includes(b),
    padDown: (b: string) => pad.includes(b),
  });

  it("ORs keyboard, mouse and gamepad", () => {
    const b = { keyboard: ["ArrowUp", "w"], mouse: "right" as const, gamepad: "south" };
    expect(isBindingDown(b, src(["w"]))).toBe(true);
    expect(isBindingDown(b, src(["up"]))).toBe(true);
    expect(isBindingDown(b, src([], ["right"]))).toBe(true);
    expect(isBindingDown(b, src([], [], ["south"]))).toBe(true);
    expect(isBindingDown(b, src(["x"], ["left"], ["east"]))).toBe(false);
  });
});

describe("gamepad math", () => {
  it("dead zone zeroes small input and rescales the rest", () => {
    expect(applyDeadZone(0.1, 0.1).length()).toBe(0);
    const full = applyDeadZone(1, 0);
    expect(full.x).toBeCloseTo(1);
    const half = applyDeadZone(0.575, 0);
    expect(half.x).toBeCloseTo(0.5);
  });

  it("merges pads", () => {
    const pad = (pressed: number[], axes: number[]) => ({
      connected: true,
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
      axes,
    });
    const snap = readGamepads([null, pad([0, 12], [0.9, 0, 0, 0]), pad([1], [0, 0, 0, -1])]);
    expect([...snap.down].sort()).toEqual(["dpad-up", "east", "south"]);
    expect(snap.left.x).toBeGreaterThan(0.8);
    expect(snap.right.y).toBeCloseTo(-1);
  });
});

describe("inputToWorld", () => {
  it("maps forward/right onto a facing", () => {
    const f = new Vector3(0, 0, -1);
    expect(inputToWorld(0, 1, f).toArray()).toEqual([0, 0, -1]);
    const right = inputToWorld(1, 0, f);
    expect(right.x).toBeCloseTo(1);
    const facingEast = new Vector3(1, 0, 0);
    const fwd = inputToWorld(0, 1, facingEast);
    expect(fwd.x).toBeCloseTo(1);
    // Diagonals are normalized, nothing gives zero.
    expect(inputToWorld(1, 1, f).length()).toBeCloseTo(1);
    expect(inputToWorld(0, 0, f).length()).toBe(0);
  });
});

describe("input plugin (headless)", () => {
  /** Steps one frame and reports `isButtonPressed/Released/Down` as seen during it. */
  const probe = (k: Engine, btn: string) => {
    const seen = { pressed: false, released: false, down: false };
    const c = k.onUpdate(() => {
      seen.pressed = k.isButtonPressed(btn);
      seen.released = k.isButtonReleased(btn);
      seen.down = k.isButtonDown(btn);
    });
    k.step(0.016);
    c.cancel();
    return seen;
  };

  it("virtual buttons: press, down, release across frames", () => {
    const k = make();
    k.pressButton("fire");
    expect(k.isButtonDown("fire")).toBe(false); // takes effect at frameStart
    expect(probe(k, "fire")).toEqual({ pressed: true, released: false, down: true });
    expect(probe(k, "fire")).toEqual({ pressed: false, released: false, down: true });
    k.releaseButton("fire");
    expect(probe(k, "fire")).toEqual({ pressed: false, released: true, down: false });
    expect(probe(k, "fire")).toEqual({ pressed: false, released: false, down: false });
    // The per-frame sets are cleared at frameEnd.
    expect(k.isButtonReleased("fire")).toBe(false);
  });

  it("a press and release within one frame still counts as pressed", () => {
    const k = make();
    k.pressButton("tap");
    k.releaseButton("tap");
    expect(probe(k, "tap")).toEqual({ pressed: true, released: true, down: false });
  });

  it("fires press/release handlers and held handlers every frame", () => {
    const k = make();
    const log: string[] = [];
    k.onButtonPress("jump", (b) => log.push(`press ${b}`));
    k.onButtonRelease(["jump"], (b) => log.push(`release ${b}`));
    k.onButtonDown("jump", () => log.push("down"));
    k.onButtonPress((b) => log.push(`any ${b}`));
    k.pressButton("jump");
    k.step(0.016);
    k.step(0.016);
    k.releaseButton("jump");
    k.step(0.016);
    expect(log).toEqual(["press jump", "any jump", "down", "down", "release jump"]);
  });

  it("defines left/right/up/down/jump by default and lets opts override them", () => {
    const k = make();
    expect(k.getButton("left")?.keyboard).toEqual(["left", "a"]);
    expect(k.getButton("jump")?.keyboard).toBe("space");
    const custom = make({ buttons: { jump: { keyboard: "x" }, fire: { keyboard: "f" } } });
    expect(custom.getButton("jump")?.keyboard).toBe("x");
    expect(custom.getButton("fire")?.keyboard).toBe("f");
    expect(custom.getButton("left")?.keyboard).toEqual(["left", "a"]);
    custom.setButton("fire", { mouse: "right" });
    expect(custom.getButton("fire")).toEqual({ mouse: "right" });
  });

  it("scopes listeners to the scene: go() clears them, top-level ones stay", () => {
    const k = make();
    const calls: string[] = [];
    k.onButtonPress("jump", () => calls.push("global"));
    k.scene("a", () => {
      k.onButtonPress("jump", () => calls.push("scene a"));
    });
    k.scene("b", () => {});
    k.go("a");
    k.pressButton("jump");
    k.step(0.016);
    expect(calls).toEqual(["global", "scene a"]);
    k.releaseButton("jump");
    k.step(0.016);
    calls.length = 0;
    k.go("b");
    k.step(0.016); // enters b
    k.pressButton("jump");
    k.step(0.016);
    expect(calls).toEqual(["global"]);
  });

  it("inputDir: world-relative uses -Z as forward", () => {
    const k = make();
    k.pressButton("up");
    k.step(0.016);
    expect(k.inputDir("left", "right", "up", "down", { relativeTo: "world" }).toArray()).toEqual([
      0, 0, -1,
    ]);
    k.pressButton("right");
    k.step(0.016);
    const d = k.inputDir("left", "right", "up", "down", { relativeTo: "world" });
    expect(d.length()).toBeCloseTo(1);
    expect(d.x).toBeGreaterThan(0);
    expect(d.z).toBeLessThan(0);
  });

  it("inputDir: camera-relative follows where the camera looks", () => {
    const k = make();
    k.camera3d.position.set(10, 5, 0);
    k.camera3d.lookAt(0, 5, 0); // looking towards -X
    k.pressButton("up");
    k.step(0.016);
    const d = k.inputDir();
    expect(d.x).toBeCloseTo(-1);
    expect(d.z).toBeCloseTo(0);
    k.releaseButton("up");
    k.pressButton("right");
    k.step(0.016);
    const r = k.inputDir();
    // Facing -X, the right hand points to -Z.
    expect(r.z).toBeCloseTo(-1);
  });

  it("inputDir is zero without input, and opposite buttons cancel", () => {
    const k = make();
    expect(k.inputDir().length()).toBe(0);
    k.pressButton("left");
    k.pressButton("right");
    k.step(0.016);
    expect(k.inputDir().length()).toBe(0);
  });

  it("inputDir keeps working when looking straight down", () => {
    const k = make();
    k.camera3d.position.set(0, 10, 0);
    k.camera3d.lookAt(0, 0, 0);
    k.pressButton("up");
    k.step(0.016);
    expect(k.inputDir().length()).toBeCloseTo(1);
  });

  it("mouse and keyboard queries are inert headless", () => {
    const k = make();
    k.step(0.016);
    expect(k.isKeyDown("a")).toBe(false);
    expect(k.isKeyPressed()).toBe(false);
    expect(k.mousePos().toArray()).toEqual([0, 0]);
    expect(k.mouseDeltaPos().toArray()).toEqual([0, 0]);
    expect(k.isPointerLocked()).toBe(false);
    k.lockPointer(); // no canvas: must not throw
    expect(k.getGamepadStick("left").length()).toBe(0);
  });
});

describe("gamepad polling", () => {
  const nav = globalThis.navigator as unknown as { getGamepads?: () => unknown[] };
  afterEach(() => {
    delete nav.getGamepads;
  });

  it("presses mapped buttons and reads the stick", () => {
    let held = [false, false];
    let axes = [0, 0, 0, 0];
    Object.defineProperty(nav, "getGamepads", {
      configurable: true,
      value: () => [
        {
          connected: true,
          buttons: held.map((pressed) => ({ pressed })),
          axes,
        },
      ],
    });
    const k = make();
    const seen: string[] = [];
    k.onGamepadButtonPress((b) => seen.push(b));
    held = [true, false];
    axes = [0, -1, 0, 0];
    k.step(0.016);
    expect(seen).toEqual(["south"]);
    expect(k.isGamepadButtonDown("south")).toBe(true);
    expect(k.isButtonDown("jump")).toBe(true); // default binding
    expect(k.getGamepadStick("left").y).toBeCloseTo(-1);
    // Stick forward moves "up" in camera-relative inputDir.
    expect(k.inputDir().z).toBeLessThan(0);
    held = [false, false];
    axes = [0, 0, 0, 0];
    k.step(0.016);
    expect(k.isGamepadButtonDown("south")).toBe(false);
    expect(k.isButtonDown("jump")).toBe(false);
  });
});
