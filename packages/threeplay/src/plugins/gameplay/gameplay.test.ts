import { Box3, BoxGeometry, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../core/engine.js";
import type { Engine } from "../../core/types.js";
import { renderPlugin } from "../render/index.js";
import { transformPlugin } from "../transform/index.js";
import { gameplayPlugin } from "./index.js";

const make = () =>
  createEngine({ loop: "manual", renderer: "none", maxDt: 1 }, [
    renderPlugin,
    transformPlugin,
    gameplayPlugin,
  ]) as Engine;

describe("health", () => {
  it("hurts, heals (clamped) and fires events", () => {
    const k = make();
    const o = k.add([k.health(3, 5)]);
    const log: string[] = [];
    o.onHurt((n) => log.push(`hurt${n}`));
    o.onHeal((n) => log.push(`heal${n}`));
    o.hurt();
    o.hurt(1);
    expect(o.hp).toBe(1);
    o.heal(10);
    expect(o.hp).toBe(5);
    expect(log).toEqual(["hurt1", "hurt1", "heal10"]);
  });

  it("death fires once until hp is positive again", () => {
    const k = make();
    const o = k.add([k.health(2)]);
    let deaths = 0;
    o.onDeath(() => deaths++);
    o.hurt(5);
    o.hurt(1);
    expect(o.hp).toBe(0);
    expect(deaths).toBe(1);
    o.heal(1);
    o.hurt(1);
    expect(deaths).toBe(2);
    o.setHP(3);
    o.hp -= 3; // plain assignment goes through the accessor
    expect(deaths).toBe(3);
  });

  it("clamps setHP to [0, maxHp]", () => {
    const k = make();
    const o = k.add([k.health(2, 4)]);
    o.setHP(99);
    expect(o.hp).toBe(4);
    o.setHP(-3);
    expect(o.hp).toBe(0);
  });
});

describe("state", () => {
  it("fires the initial enter on the first frame, then update handlers", () => {
    const k = make();
    const o = k.add([k.state("idle", ["idle", "run"])]);
    const log: string[] = [];
    o.onStateEnter("idle", () => log.push("enter idle"));
    o.onStateUpdate("idle", () => log.push("update idle"));
    expect(log).toEqual([]);
    k.step(0.016);
    k.step(0.016);
    expect(log).toEqual(["enter idle", "update idle", "update idle"]);
  });

  it("enterState ends the old state, passes args and validates names", () => {
    const k = make();
    const o = k.add([k.state("idle", ["idle", "run"])]);
    const log: unknown[] = [];
    k.step(0.016);
    o.onStateEnd("idle", () => log.push("end idle"));
    o.onStateEnter("run", (speed: number) => log.push(`enter run ${speed}`));
    o.onStateUpdate("run", () => log.push("update run"));
    o.enterState("run", 7);
    expect(o.state).toBe("run");
    k.step(0.016);
    expect(log).toEqual(["end idle", "enter run 7", "update run"]);
    expect(() => o.enterState("fly")).toThrow(/not allowed.*idle, run/);
    expect(() => k.add([k.state("nope", ["a"])])).toThrow(/not allowed/);
  });

  it("does not update while paused", () => {
    const k = make();
    const o = k.add([k.state("a")]);
    let n = 0;
    o.onStateUpdate("a", () => n++);
    o.paused = true;
    k.step(0.016);
    expect(n).toBe(0);
  });
});

describe("lifespan", () => {
  it("destroys the object after the given seconds", () => {
    const k = make();
    const o = k.add([k.lifespan(0.5)]);
    k.step(0.3);
    expect(o.exists()).toBe(true);
    k.step(0.3);
    expect(o.exists()).toBe(false);
  });

  it("fades opacity during the last `fade` seconds when the object has it", () => {
    const k = make();
    let opacity = 1;
    const o = k.add([
      {
        id: "opacity",
        get opacity() {
          return opacity;
        },
        set opacity(v: number) {
          opacity = v;
        },
      },
      k.lifespan(1, { fade: 0.5 }),
    ]);
    k.step(0.4);
    expect(opacity).toBe(1);
    k.step(0.35); // 0.75 elapsed, 0.25 left of 0.5
    expect(opacity).toBeCloseTo(0.5);
    k.step(0.1);
    expect(opacity).toBeCloseTo(0.3);
    k.step(0.2);
    expect(o.exists()).toBe(false);
  });
});

describe("timer", () => {
  it("wait, loop and tween tick with the object", () => {
    const k = make();
    const o = k.add([k.timer()]);
    const log: string[] = [];
    o.wait(0.2, () => log.push("wait"));
    let count = 0;
    o.loop(0.1, () => count++, 3);
    let v = -1;
    const tw = o.tween(0, 10, 0.2, (x) => {
      v = x;
    });
    expect(count).toBe(1); // loop runs right away, like k.loop
    expect(v).toBe(0);
    k.step(0.1);
    expect(v).toBeCloseTo(5);
    k.step(0.1);
    expect(log).toEqual(["wait"]);
    expect(count).toBe(3);
    expect(v).toBe(10);
    expect(tw.finished).toBe(true);
  });

  it("respects obj.paused and dies with the object", () => {
    const k = make();
    const o = k.add([k.timer()]);
    let fired = 0;
    o.wait(0.1, () => fired++);
    o.paused = true;
    k.step(0.2);
    expect(fired).toBe(0);
    o.paused = false;
    k.step(0.2);
    expect(fired).toBe(1);

    const p = k.add([k.timer()]);
    p.wait(0.1, () => fired++);
    p.destroy();
    k.step(0.2);
    expect(fired).toBe(1);
  });

  it("cancel stops a timer and the controller is awaitable", async () => {
    const k = make();
    const o = k.add([k.timer()]);
    let fired = 0;
    o.wait(0.1, () => fired++).cancel();
    const t = o.wait(0.1);
    k.step(0.2);
    await t;
    expect(fired).toBe(0);
    expect(t.finished).toBe(true);
  });
});

describe("offscreen", () => {
  it("fires exit/enter by distance to the camera and can destroy", () => {
    const k = make();
    k.camera3d.position.set(0, 0, 0);
    const o = k.add([k.pos(0, 0, -5), k.offscreen({ distance: 10 })]);
    const log: string[] = [];
    o.onExitScreen(() => log.push("exit"));
    o.onEnterScreen(() => log.push("enter"));
    k.step(0.016);
    expect(o.isOffScreen()).toBe(false);
    o.pos.z = -50;
    k.step(0.016);
    expect(o.isOffScreen()).toBe(true);
    o.pos.z = -5;
    k.step(0.016);
    expect(log).toEqual(["exit", "enter"]);

    const d = k.add([k.pos(0, 0, -50), k.offscreen({ distance: 10, destroy: true })]);
    k.step(0.016);
    expect(d.exists()).toBe(false);
  });

  it("frustum test uses the camera view", () => {
    const k = make();
    k.camera3d.position.set(0, 0, 0);
    k.camera3d.lookAt(0, 0, -1);
    const front = k.add([k.pos(0, 0, -5), k.offscreen({ frustum: true })]);
    const behind = k.add([k.pos(0, 0, 5), k.offscreen({ frustum: true })]);
    k.step(0.016);
    expect(front.isOffScreen()).toBe(false);
    expect(behind.isOffScreen()).toBe(true);
  });

  it("frustum test of a mesh uses its cached bounds, scaled and moved with the object", () => {
    const k = make();
    k.camera3d.position.set(0, 0, 0);
    k.camera3d.lookAt(0, 0, -1);
    k.camera3d.updateMatrixWorld();
    const spy = vi.spyOn(Box3.prototype, "setFromObject");
    // Its origin is far to the side (outside the view) but a 20 m wide box reaches into it.
    const big = k.add([
      k.pos(18, 0, -10),
      k.scale(2),
      { mesh: new Mesh(new BoxGeometry(10, 1, 1)) },
      k.offscreen({ frustum: true }),
    ]);
    big.object3d.add(big.mesh as Mesh);
    const small = k.add([
      k.pos(18, 0, -10),
      { mesh: new Mesh(new BoxGeometry(1, 1, 1)) },
      k.offscreen({ frustum: true }),
    ]);
    small.object3d.add(small.mesh as Mesh);
    k.step(0.016);
    expect(big.isOffScreen()).toBe(false);
    expect(small.isOffScreen()).toBe(true);
    big.pos.x = 100; // moving the object moves the cached bounds
    k.step(0.016);
    expect(big.isOffScreen()).toBe(true);
    for (let i = 0; i < 3; i++) k.step(0.016);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
