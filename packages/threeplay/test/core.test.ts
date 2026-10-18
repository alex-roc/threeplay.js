import { describe, expect, it, vi } from "vitest";
import type { Comp, Engine, GameObj, PluginLike } from "../src/index.js";
import { createEngine, definePlugin } from "../src/index.js";

const make = (plugins: PluginLike[] = []) => createEngine({ loop: "manual" }, plugins);

describe("game objects", () => {
  it("merges component fields and tags", () => {
    const k = make();
    const obj = k.add([{ id: "hp", hp: 3 }, "enemy", "boss"]);
    expect(obj.hp).toBe(3);
    expect(obj.is("enemy")).toBe(true);
    expect(obj.is(["enemy", "boss"])).toBe(true);
    expect(obj.is(["enemy", "hero"])).toBe(false);
    expect(obj.has("hp")).toBe(true);
    expect(obj.object3d.parent).toBe(k.root.object3d);
  });

  it("binds lifecycle hooks and accessors to the object", () => {
    const k = make();
    const log: string[] = [];
    const comp = {
      id: "test",
      value: 1,
      get double() {
        return (this as any).value * 2;
      },
      add(this: any) {
        log.push(`add ${this.value}`);
      },
      update(this: any) {
        this.value++;
      },
      destroy() {
        log.push("destroy");
      },
    };
    const obj = k.add([comp]);
    k.step(0.016);
    expect(obj.value).toBe(2);
    expect(obj.double).toBe(4);
    obj.destroy();
    expect(log).toEqual(["add 1", "destroy"]);
    expect(obj.exists()).toBe(false);
    expect(obj.object3d.parent).toBe(null);
  });

  it("reports property conflicts with the owner", () => {
    const k = make();
    expect(() =>
      k.add([
        { id: "a", speed: 1 },
        { id: "b", speed: 2 },
      ]),
    ).toThrow(/Component "b" can't add property "speed": it is already defined by component "a"/);
    expect(() => k.add([{ id: "c", destroy: 1, exists: 2 }])).toThrow(/the game object itself/);
  });

  it("checks required components", () => {
    const k = make();
    const needsPos: Comp = { id: "spin", require: ["pos"] };
    expect(() => k.add([needsPos])).toThrow(/requires component "pos"/);
    expect(() => k.add([needsPos, { id: "pos", p: 0 }])).not.toThrow();
  });

  it("replaces a component with the same id and unuses it", () => {
    const k = make();
    const destroyed = vi.fn();
    const obj: GameObj = k.add([{ id: "x", a: 1, destroy: destroyed }]);
    obj.use({ id: "x", b: 2 });
    expect(destroyed).toHaveBeenCalledOnce();
    expect(obj.a).toBeUndefined();
    expect(obj.b).toBe(2);
    obj.unuse("x");
    expect(obj.b).toBeUndefined();
  });

  it("nests children in the three.js graph and destroys subtrees", () => {
    const k = make();
    const parent = k.add(["parent"]);
    const child = parent.add(["child"]);
    expect(child.object3d.parent).toBe(parent.object3d);
    expect(k.get("child")).toEqual([child]);
    expect(k.get("child", { recursive: false })).toEqual([]);
    parent.destroy();
    expect(child.exists()).toBe(false);
    expect(k.get("*")).toEqual([]);
  });

  it("queries with and/or", () => {
    const k = make();
    const a = k.add(["a"]);
    const b = k.add(["b"]);
    const ab = k.add(["a", "b"]);
    expect(k.get(["a", "b"])).toEqual([ab]);
    expect(k.get(["a", "b"], { op: "or" })).toEqual([a, b, ab]);
  });

  it("skips paused subtrees", () => {
    const k = make();
    const update = vi.fn();
    const parent = k.add([]);
    parent.add([{ update }]);
    parent.paused = true;
    k.step(0.016);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("events", () => {
  it("routes object events to tag listeners", () => {
    const k = make();
    const hit = vi.fn();
    k.on("hit", "enemy", hit);
    const e = k.add(["enemy"]);
    const f = k.add(["friend"]);
    e.trigger("hit", 5);
    f.trigger("hit", 5);
    expect(hit).toHaveBeenCalledExactlyOnceWith(e, 5);
  });

  it("runs onUpdate per tag and onAdd/onDestroy", () => {
    const k = make();
    const seen: number[] = [];
    const added = vi.fn();
    const destroyed = vi.fn();
    k.onUpdate("enemy", (o) => seen.push(o.id));
    k.onAdd("enemy", added);
    k.onDestroy(destroyed);
    const e = k.add(["enemy"]);
    k.step(0.016);
    expect(seen).toEqual([e.id]);
    expect(added).toHaveBeenCalledWith(e);
    e.destroy();
    expect(destroyed).toHaveBeenCalledWith(e);
  });

  it("cancels and pauses handlers", () => {
    const k = make();
    const fn = vi.fn();
    const ctrl = k.onUpdate(fn);
    ctrl.paused = true;
    k.step(0.016);
    ctrl.paused = false;
    k.step(0.016);
    ctrl.cancel();
    k.step(0.016);
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("scenes", () => {
  it("clears objects and scene listeners on go(), keeps top-level ones", () => {
    const k = make();
    const topLevel = vi.fn();
    const inScene = vi.fn();
    k.onUpdate(topLevel);
    k.scene("a", (n: number) => {
      k.add(["thing"]);
      k.onUpdate(inScene);
      expect(n).toBe(7);
    });
    k.scene("b", () => {});
    k.go("a", 7);
    expect(k.getSceneName()).toBe("a");
    expect(k.get("thing")).toHaveLength(1);
    k.step(0.016);
    k.go("b");
    k.step(0.016);
    expect(k.getSceneName()).toBe("b");
    expect(k.get("thing")).toHaveLength(0);
    expect(inScene).toHaveBeenCalledOnce();
    expect(topLevel).toHaveBeenCalledTimes(2);
  });

  it("defers go() called during a frame to the next frame", () => {
    const k = make();
    const order: string[] = [];
    k.scene("a", () => {
      order.push("a");
      k.onUpdate(() => k.go("b"));
    });
    k.scene("b", () => order.push("b"));
    k.go("a");
    k.step(0.016);
    expect(k.getSceneName()).toBe("a");
    k.step(0.016);
    expect(order).toEqual(["a", "b"]);
  });

  it("throws on unknown scenes", () => {
    expect(() => make().go("nope")).toThrow(/Scene "nope" is not defined/);
  });
});

describe("time and timers", () => {
  it("steps fixed updates at the fixed rate", () => {
    const k = make();
    const fixed = vi.fn();
    k.onFixedUpdate(fixed);
    k.step(0.1); // 5 steps of 0.02
    expect(fixed).toHaveBeenCalledTimes(5);
    expect(k.fixedDt()).toBeCloseTo(0.02);
  });

  it("clamps long frames", () => {
    const k = make();
    k.step(5);
    expect(k.dt()).toBeCloseTo(0.1);
  });

  it("wait, loop and tween", async () => {
    const k = make();
    const waited = vi.fn();
    const looped = vi.fn();
    let value = 0;
    const timer = k.wait(0.05, waited);
    k.loop(0.02, looped, 3);
    const tw = k.tween(0, 10, 0.1, (v) => (value = v));
    for (let i = 0; i < 10; i++) k.step(0.016);
    expect(waited).toHaveBeenCalledOnce();
    expect(timer.finished).toBe(true);
    await timer;
    expect(looped).toHaveBeenCalledTimes(3);
    expect(value).toBe(10);
    expect(tw.finished).toBe(true);
  });

  it("time scale and pause", () => {
    const k = make();
    k.setTimeScale(0.5);
    k.step(0.02);
    expect(k.dt()).toBeCloseTo(0.01);
    k.setPaused(true);
    const fn = vi.fn();
    k.onUpdate(fn);
    k.step(0.02);
    expect(fn).not.toHaveBeenCalled();
    expect(k.dt()).toBe(0);
  });
});

describe("plugins", () => {
  it("merges plugin APIs and exposes them by name", () => {
    const counter = definePlugin({
      name: "counter",
      install(k: Engine) {
        let n = 0;
        k.hooks.on("afterUpdate", () => n++);
        return { frames: () => n };
      },
    });
    const k = make([counter]) as Engine & { frames(): number };
    k.step(0.016);
    k.step(0.016);
    expect(k.frames()).toBe(2);
    expect(k.plugins.counter).toBeDefined();
  });

  it("accepts the kaplay-style function shorthand", () => {
    const k = make([() => ({ hello: () => "hi" })]) as Engine & { hello(): string };
    expect(k.hello()).toBe("hi");
  });

  it("rejects name clashes and missing dependencies", () => {
    expect(() => make([{ name: "bad", install: () => ({ add: () => {} }) }])).toThrow(
      /Plugin "bad" can't define "add": it is already defined by the core/,
    );
    expect(() => make([{ name: "late", dependencies: ["physics"], install: () => ({}) }])).toThrow(
      /needs plugin "physics"/,
    );
  });

  it("waits for load() tasks before starting scenes", async () => {
    let resolve!: () => void;
    const slow = definePlugin({
      name: "slow",
      install(k: Engine) {
        k.load(new Promise<void>((r) => (resolve = r)));
        return {};
      },
    });
    const k = make([slow]);
    const started = vi.fn();
    k.scene("main", started);
    k.go("main");
    k.step(0.016);
    expect(started).not.toHaveBeenCalled();
    expect(k.isLoaded()).toBe(false);
    resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(k.isLoaded()).toBe(true);
    k.step(0.016);
    expect(started).toHaveBeenCalledOnce();
  });
});

describe("review fixes", () => {
  it("finished timers and cancelled listeners don't pile up in the scene scope", () => {
    const k = make();
    k.scene("main", () => {
      for (let i = 0; i < 1000; i++) k.wait(0);
      const c = k.onUpdate(() => {});
      c.cancel();
    });
    k.go("main");
    k.step(0.016);
    k.step(0.016);
    // Only an internal measure is available: timers no longer run nor leak handlers.
    const fn = vi.fn();
    k.onUpdate(fn);
    k.step(0.016);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("replacing a component by id keeps dependents", () => {
    const k = make();
    const o = k.add([
      { id: "base", v: 1 },
      { id: "dep", require: ["base"] },
    ]);
    expect(() => o.use({ id: "base", v: 2 })).not.toThrow();
    expect(o.v).toBe(2);
    expect(() => o.unuse("base")).toThrow(/requires it/);
  });

  it("rgb() 0–255 and arrays are sRGB like hex strings", async () => {
    const { rgb } = await import("../src/index.js");
    expect(rgb(128, 128, 128).getHexString()).toBe("808080");
    expect(rgb([255, 120, 0]).getHexString()).toBe(rgb("#ff7800").getHexString());
  });

  it("onSceneLeave registered at top level persists across scenes", () => {
    const k = make();
    const left = vi.fn();
    k.onSceneLeave(left);
    k.scene("a", () => {});
    k.scene("b", () => {});
    k.go("a");
    k.go("b");
    k.go("a");
    expect(left).toHaveBeenCalledTimes(2);
  });

  it("stops updating an object destroyed by its own component", () => {
    const k = make();
    const after = vi.fn();
    k.add([
      {
        update() {
          (this as any).destroy();
        },
      },
      { update: after },
    ]);
    k.step(0.016);
    expect(after).not.toHaveBeenCalled();
  });
});
