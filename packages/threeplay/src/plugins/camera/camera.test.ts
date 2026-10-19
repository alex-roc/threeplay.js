import { Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createEngine, definePlugin } from "../../core/engine.js";
import type { Engine, PluginLike } from "../../core/types.js";
import type { InputAPI } from "../input/types.js";
import { renderPlugin } from "../render/index.js";
import { transformPlugin } from "../transform/index.js";
import { cameraPlugin } from "./index.js";
import {
  horizontalForward,
  offsetAngles,
  orbitOffset,
  smoothFactor,
  yawOfDirection,
} from "./math.js";

/** Mouse state the camera reads, controlled by the tests. */
interface FakeMouse {
  delta: Vector2;
  down: Set<string>;
  locked: boolean;
  scroll: Array<(d: Vector2) => void>;
}

/** Replaces the input plugin: the camera only needs these few functions. */
function fakeInput(mouse: FakeMouse) {
  return definePlugin<Partial<InputAPI>>({
    name: "input",
    dependencies: ["render"],
    install: () => ({
      mouseDeltaPos: () => mouse.delta.clone(),
      isMouseDown: (btn = "left") => mouse.down.has(btn),
      isPointerLocked: () => mouse.locked,
      lockPointer() {
        mouse.locked = true;
      },
      onScroll(fn: (d: Vector2) => void) {
        mouse.scroll.push(fn);
        return {
          paused: false,
          cancel() {
            mouse.scroll.splice(mouse.scroll.indexOf(fn), 1);
          },
        };
      },
    }),
  });
}

function make(extra: PluginLike[] = []) {
  const mouse: FakeMouse = { delta: new Vector2(), down: new Set(), locked: false, scroll: [] };
  const k = createEngine({ loop: "manual", renderer: "none" }, [
    renderPlugin,
    transformPlugin,
    fakeInput(mouse),
    ...extra,
    cameraPlugin,
  ]) as Engine;
  return { k, mouse };
}

const dirOf = (k: Engine) => k.camera3d.getWorldDirection(new Vector3());

describe("camera math", () => {
  it("smoothing is frame-rate independent", () => {
    expect(smoothFactor(0, 0.016)).toBe(1);
    // Two 60 Hz frames cover the same ground as one 30 Hz frame.
    const two = 1 - (1 - smoothFactor(0.1, 1 / 60)) ** 2;
    expect(two).toBeCloseTo(smoothFactor(0.1, 1 / 30));
    expect(smoothFactor(0.5, 0.016)).toBeLessThan(smoothFactor(0.1, 0.016));
  });

  it("orbit offsets and angles are inverse", () => {
    expect(orbitOffset(0, 0, 5).toArray()).toEqual([0, 0, 5]);
    const o = orbitOffset(40, 25, 7);
    expect(o.length()).toBeCloseTo(7);
    const a = offsetAngles(o)!;
    expect(a.yaw).toBeCloseTo(40);
    expect(a.pitch).toBeCloseTo(25);
    expect(offsetAngles(new Vector3())).toBeNull();
  });

  it("yaw 0 is −Z and turning left is positive", () => {
    expect(yawOfDirection({ x: 0, z: -1 })).toBeCloseTo(0);
    expect(yawOfDirection({ x: -1, z: 0 })).toBeCloseTo(90);
    expect(yawOfDirection({ x: 1, z: 0 })).toBeCloseTo(-90);
  });

  it("horizontalForward falls back to screen-up when looking straight down", () => {
    const { k } = make();
    k.camera3d.position.set(0, 10, 0);
    k.camera3d.lookAt(0, 0, 0);
    expect(horizontalForward(k.camera3d).length()).toBeCloseTo(1);
  });
});

describe("camera basics", () => {
  it("camPos gets and sets, camFov updates the projection", () => {
    const { k } = make();
    expect(k.camPos().toArray()).toEqual([0, 5, 10]);
    k.camPos(1, 2, 3);
    expect(k.camera3d.position.toArray()).toEqual([1, 2, 3]);
    k.camPos(k.vec3(4, 5, 6));
    expect(k.camPos().toArray()).toEqual([4, 5, 6]);
    expect(k.camFov()).toBe(60);
    k.camera3d.projectionMatrix.identity();
    expect(k.camFov(90)).toBe(90);
    expect(k.camera3d.projectionMatrix.elements[0]).not.toBe(1);
  });

  it("camLookAt points at a position or an object", () => {
    const { k } = make();
    k.camPos(0, 0, 0);
    k.camLookAt({ x: 10, y: 0, z: 0 });
    expect(dirOf(k).x).toBeCloseTo(1);
    const o = k.add([k.pos(0, 0, -10)]);
    k.camLookAt(o);
    expect(dirOf(k).z).toBeCloseTo(-1);
  });

  it("camForward / camRight are horizontal and unit", () => {
    const { k } = make();
    expect(k.camForward().toArray().map(Math.abs)).toEqual([0, 0, 1]); // default looks to -Z
    expect(k.camForward().z).toBeCloseTo(-1);
    expect(k.camRight().x).toBeCloseTo(1);
    k.camPos(0, 5, 0);
    k.camLookAt({ x: 5, y: 0, z: 0 }); // looking east and down
    expect(k.camForward().x).toBeCloseTo(1);
    expect(k.camForward().y).toBe(0);
    expect(k.camRight().z).toBeCloseTo(1);
  });
});

describe("controllers", () => {
  it("only one controller is active: starting one stops the previous", () => {
    const { k } = make();
    const target = k.add([k.pos()]);
    const a = k.camFollow(target);
    expect(k.getCameraController()).toBe(a);
    const b = k.topDown(target);
    expect(k.getCameraController()).toBe(b);
    a.stop(); // stale stop must not touch the new controller
    expect(k.getCameraController()).toBe(b);
    b.stop();
    expect(k.getCameraController()).toBeNull();
  });

  it("scene changes stop the controller and reset the camera", () => {
    const { k } = make();
    const target = k.add([k.pos(50, 0, 0)]);
    k.camFollow(target, { smooth: 0 });
    k.camFov(100);
    k.step(0.016);
    expect(k.camera3d.position.x).toBeCloseTo(50);
    k.scene("a", () => {});
    k.go("a");
    expect(k.getCameraController()).toBeNull();
    expect(k.camera3d.position.toArray()).toEqual([0, 5, 10]);
    expect(k.camFov()).toBe(60);
    expect(dirOf(k).z).toBeLessThan(-0.8);
  });

  it("camFollow keeps the offset and looks at the target", () => {
    const { k } = make();
    const target = k.add([k.pos(10, 0, 0)]);
    k.camFollow(target, { smooth: 0 });
    k.step(0.016);
    expect(k.camera3d.position.toArray()).toEqual([10, 4, 8]);
    const toTarget = new Vector3(10, 0, 0).sub(k.camera3d.position).normalize();
    expect(dirOf(k).distanceTo(toTarget)).toBeLessThan(1e-4);
  });

  it("camFollow smooths over time and converges", () => {
    const { k } = make();
    const target = k.add([k.pos(20, 0, 0)]);
    k.camFollow(target, { offset: { x: 0, y: 0, z: 0 }, smooth: 0.5, lookAt: false });
    k.camPos(0, 0, 0);
    k.step(1 / 60);
    expect(k.camera3d.position.x).toBeGreaterThan(0);
    expect(k.camera3d.position.x).toBeLessThan(20);
    for (let i = 0; i < 200; i++) k.step(1 / 60);
    expect(k.camera3d.position.x).toBeCloseTo(20, 1);
  });

  it("camFollow can rotate the offset with the target", () => {
    const { k } = make();
    const target = k.add([k.pos(), k.rotate(0, 90, 0)]);
    k.camFollow(target, { smooth: 0, offset: { x: 0, y: 4, z: 8 }, rotateWithTarget: true });
    k.step(0.016);
    // The target faces -X, so "behind" is +X.
    expect(k.camera3d.position.x).toBeCloseTo(8);
    expect(k.camera3d.position.z).toBeCloseTo(0);
  });

  it("topDown looks down at a fixed tilt and follows the target", () => {
    const { k } = make();
    const target = k.add([k.pos(3, 0, 4)]);
    k.topDown(target, { height: 10, angle: 0, smooth: 0 });
    k.step(0.016);
    expect(k.camera3d.position.x).toBeCloseTo(3);
    expect(k.camera3d.position.y).toBeCloseTo(10);
    expect(k.camera3d.position.z).toBeCloseTo(4);
    expect(dirOf(k).y).toBeCloseTo(-1);
    k.topDown(target, { height: 10, angle: 30, smooth: 0 });
    k.step(0.016);
    expect(dirOf(k).y).toBeCloseTo(-Math.cos(Math.PI / 6));
    expect(dirOf(k).z).toBeLessThan(0);
    expect(k.camera3d.position.z).toBeCloseTo(4 + 10 * Math.tan(Math.PI / 6));
  });

  it("firstPerson puts the camera at the eyes and mouse movement turns yaw and pitch", () => {
    const { k, mouse } = make();
    const target = k.add([k.pos(2, 1, 3), k.rotate()]);
    const fp = k.firstPerson(target, { lockOnClick: false, sensitivity: 0.5, height: 0.7 });
    k.step(0.016);
    expect(k.camera3d.position.toArray()).toEqual([2, 1.7, 3]);
    expect(dirOf(k).z).toBeCloseTo(-1);
    mouse.delta.set(90, 0); // 45 degrees right
    k.step(0.016);
    expect(fp.yaw).toBeCloseTo(-45);
    mouse.delta.set(0, 0);
    // Right of -Z is +X.
    expect(dirOf(k).x).toBeGreaterThan(0.7);
    // target.forward() matches where the camera looks (-Z convention).
    expect(target.forward().distanceTo(dirOf(k))).toBeLessThan(1e-4);
    expect(target.rot.y).toBeCloseTo(-45);
  });

  it("firstPerson clamps pitch and reads the mouse only when locked (with lockOnClick)", () => {
    const { k, mouse } = make();
    const target = k.add([k.pos()]);
    const fp = k.firstPerson(target, { maxPitch: 80 });
    mouse.delta.set(100, 100);
    k.step(0.016);
    expect(fp.yaw).toBe(0); // not locked: ignore
    mouse.locked = true;
    mouse.delta.set(0, -10000); // up
    k.step(0.016);
    expect(fp.pitch).toBe(80);
    mouse.delta.set(0, 10000);
    k.step(0.016);
    expect(fp.pitch).toBe(-80);
    expect(dirOf(k).y).toBeLessThan(-0.95);
  });

  it("firstPerson starts from the target's heading", () => {
    const { k } = make();
    const target = k.add([k.pos(), k.rotate(0, 90, 0)]);
    const fp = k.firstPerson(target, { lockOnClick: false });
    expect(fp.yaw).toBeCloseTo(90);
    k.step(0.016);
    expect(dirOf(k).x).toBeCloseTo(-1);
  });

  it("thirdPerson orbits at a distance while dragging and respects pitch limits", () => {
    const { k, mouse } = make();
    const target = k.add([k.pos(0, 0, 0)]);
    const tp = k.thirdPerson(target, { distance: 5, height: 1, minPitch: -10, maxPitch: 40 });
    k.step(0.016);
    const look = new Vector3(0, 1, 0);
    expect(k.camera3d.position.distanceTo(look)).toBeCloseTo(5);
    expect(k.camera3d.position.z).toBeGreaterThan(0); // behind a -Z facing target
    mouse.delta.set(100, 0); // moving without a button: no orbit
    k.step(0.016);
    expect(tp.yaw).toBe(0);
    mouse.down.add("left");
    k.step(0.016);
    expect(tp.yaw).toBeCloseTo(-15);
    mouse.delta.set(0, 10000);
    k.step(0.016);
    expect(tp.pitch).toBe(40);
    mouse.delta.set(0, -10000);
    k.step(0.016);
    expect(tp.pitch).toBe(-10);
    expect(k.camera3d.position.distanceTo(look)).toBeCloseTo(5);
    // Always looks at the look point.
    expect(dirOf(k).distanceTo(look.clone().sub(k.camera3d.position).normalize())).toBeLessThan(
      1e-4,
    );
  });

  it("thirdPerson orbits freely while locked", () => {
    const { k, mouse } = make();
    const tp = k.thirdPerson(k.add([k.pos()]), { lockOnClick: true });
    mouse.delta.set(40, 0);
    k.step(0.016);
    expect(tp.yaw).toBe(0);
    mouse.locked = true;
    k.step(0.016);
    expect(tp.yaw).toBeCloseTo(-6);
  });

  it("thirdPerson pulls the camera in when a wall is in the way (physics present)", () => {
    const calls: unknown[][] = [];
    const physics = definePlugin({
      name: "physics",
      install: () => ({
        raycast: (...args: unknown[]) => {
          calls.push(args);
          return { distance: 2, obj: null, point: new Vector3(), normal: new Vector3() };
        },
      }),
    });
    const { k } = make([physics]);
    const target = k.add([k.pos(0, 0, 0)]);
    k.thirdPerson(target, { distance: 6, height: 1 });
    k.step(0.016);
    const dist = k.camera3d.position.distanceTo(new Vector3(0, 1, 0));
    expect(dist).toBeCloseTo(1.7);
    const opts = calls[0]![3] as { exclude: unknown[] };
    expect(opts.exclude).toContain(target);
    // The list is built once, not every frame.
    k.step(0.016);
    k.step(0.016);
    expect(calls).toHaveLength(3);
    expect((calls[2]![3] as { exclude: unknown[] }).exclude).toBe(opts.exclude);
  });

  it("thirdPerson over the shoulder shifts the camera to its right and keeps the aim parallel", () => {
    const { k } = make();
    const target = k.add([k.pos(0, 0, 0)]);
    const tp = k.thirdPerson(target, { distance: 5, height: 1, shoulder: 0.8 });
    tp.pitch = 0;
    k.step(0.016);
    // Camera on the +Z side looking toward −Z: its right is +X.
    expect(k.camera3d.position.x).toBeCloseTo(0.8);
    expect(k.camera3d.position.z).toBeCloseTo(5);
    expect(dirOf(k).x).toBeCloseTo(0);
    expect(dirOf(k).z).toBeCloseTo(-1);
    tp.shoulder = -tp.shoulder; // switch shoulders
    k.step(0.016);
    expect(k.camera3d.position.x).toBeCloseTo(-0.8);
  });

  it("thirdPerson without physics keeps the full distance", () => {
    const { k } = make();
    k.thirdPerson(k.add([k.pos()]), { distance: 6 });
    k.step(0.016);
    expect(k.camera3d.position.distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(6);
  });

  it("orbitCamera orbits around a point: drag, zoom, auto-rotate, limits", () => {
    const { k, mouse } = make();
    const orbit = k.orbitCamera({
      target: { x: 0, y: 0, z: 0 },
      distance: 10,
      minDistance: 4,
      maxDistance: 20,
    });
    k.step(0.016);
    expect(k.camera3d.position.length()).toBeCloseTo(10);
    expect(orbit.yaw).toBeCloseTo(0); // started from the default camera (0, 5, 10)
    mouse.delta.set(50, 0);
    k.step(0.016);
    expect(orbit.yaw).toBe(0); // not dragging
    mouse.down.add("left");
    k.step(0.016);
    expect(orbit.yaw).toBeCloseTo(-20);
    mouse.delta.set(0, 0);
    // Scrolling zooms exponentially and respects the limits.
    for (const fn of mouse.scroll) fn(new Vector2(0, 100000));
    k.step(0.016);
    expect(orbit.distance).toBe(20);
    for (const fn of mouse.scroll) fn(new Vector2(0, -100000));
    k.step(0.016);
    expect(orbit.distance).toBe(4);
    // Looks at the target.
    expect(dirOf(k).distanceTo(k.camera3d.position.clone().negate().normalize())).toBeLessThan(
      1e-4,
    );
    // Stopping releases the scroll listener.
    orbit.stop();
    expect(mouse.scroll.length).toBe(0);
  });

  it("orbitCamera auto-rotates and follows an object", () => {
    const { k } = make();
    const target = k.add([k.pos(5, 0, 5)]);
    const orbit = k.orbitCamera({ target, distance: 6, autoRotate: 90, interactive: false });
    // Starts from the default camera (0, 5, 10), seen from (5, 0, 5): yaw -45.
    expect(orbit.yaw).toBeCloseTo(-45);
    for (let i = 0; i < 5; i++) k.step(0.1); // 0.5 s at 90 deg/s
    expect(orbit.target.toArray()).toEqual([5, 0, 5]);
    expect(orbit.yaw).toBeCloseTo(0);
    expect(k.camera3d.position.distanceTo(orbit.target)).toBeCloseTo(6);
    expect(k.camera3d.position.x).toBeCloseTo(5);
  });

  it("controller state is stable when the target is destroyed", () => {
    const { k } = make();
    const target = k.add([k.pos(5, 0, 0)]);
    k.camFollow(target, { smooth: 0 });
    k.step(0.016);
    target.destroy();
    const before = k.camera3d.position.clone();
    k.step(0.016);
    expect(k.camera3d.position.equals(before)).toBe(true);
  });
});

describe("camShake", () => {
  it("offsets the camera after the controller, never accumulates, and ends", () => {
    const { k } = make();
    const target = k.add([k.pos(0, 0, 0)]);
    k.camFollow(target, { smooth: 0, lookAt: false, offset: { x: 0, y: 0, z: 0 } });
    k.camShake(1, 0.5);
    let moved = false;
    for (let i = 0; i < 20; i++) {
      k.step(1 / 60);
      const d = k.camera3d.position.length();
      expect(d).toBeLessThanOrEqual(Math.sqrt(3) + 1e-9); // within the shake cube
      if (d > 1e-6) moved = true;
    }
    expect(moved).toBe(true);
    for (let i = 0; i < 20; i++) k.step(1 / 60); // past the 0.5 s duration
    expect(k.camera3d.position.length()).toBeLessThan(1e-9);
    expect(k.camPos().length()).toBeLessThan(1e-9);
  });

  it("without a controller the base position is restored, not drifted", () => {
    const { k } = make();
    k.camPos(0, 5, 10);
    k.camShake(0.5, 0.2);
    for (let i = 0; i < 30; i++) k.step(1 / 60);
    expect(k.camera3d.position.distanceTo(new Vector3(0, 5, 10))).toBeLessThan(1e-9);
  });

  it("decays with time", () => {
    const { k } = make();
    k.camPos(0, 0, 0);
    k.camShake(10, 1);
    k.step(1 / 60);
    k.step(1 / 60);
    const early = Math.max(...k.camera3d.position.toArray().map(Math.abs));
    expect(early).toBeLessThanOrEqual(10);
    for (let i = 0; i < 54; i++) k.step(1 / 60);
    const late = Math.max(...k.camera3d.position.toArray().map(Math.abs));
    expect(late).toBeLessThan(1.5);
  });
});

describe("with the real input plugin", () => {
  it("runs a first-person controller headless and inputDir follows its yaw", async () => {
    const { inputPlugin } = await import("../input/index.js");
    const k = createEngine({ loop: "manual", renderer: "none" }, [
      renderPlugin,
      transformPlugin,
      inputPlugin,
      cameraPlugin,
    ]) as Engine;
    const player = k.add([k.pos(), k.rotate(0, 90, 0)]);
    k.firstPerson(player);
    k.pressButton("up");
    k.step(0.016);
    // The player (and the camera) face -X, so "up" walks towards -X.
    const dir = k.inputDir();
    expect(dir.x).toBeCloseTo(-1);
    expect(dir.distanceTo(player.forward())).toBeLessThan(1e-4);
  });
});
