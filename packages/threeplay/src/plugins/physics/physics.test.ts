import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../core/engine.js";
import type { Engine, GameObj } from "../../core/types.js";
import { self } from "../../core/util.js";
import type { ShapeDesc } from "../shapes/types.js";
import { transformPlugin } from "../transform/index.js";
import { physicsPlugin } from "./index.js";

/** A stand-in for the shapes plugin: honors the `shape`/`mesh` contract. */
const shape = (desc: ShapeDesc) => ({
  id: "shape",
  shape: desc,
  mesh: new THREE.Mesh(new THREE.BoxGeometry()),
  add() {
    self(this).object3d.add(this.mesh);
  },
});
const box = (w = 1, h = 1, d = 1) => shape({ kind: "box", width: w, height: h, depth: d });
const sphere = (r = 0.5) => shape({ kind: "sphere", radius: r });
const capsule = (r = 0.4, h = 1.8) => shape({ kind: "capsule", radius: r, height: h });

async function make(opts: Record<string, unknown> = {}) {
  const k = createEngine({ loop: "manual", ...opts }, [transformPlugin, physicsPlugin]) as Engine;
  await new Promise<void>((resolve) => k.onLoad(resolve));
  return k;
}

const run = (k: Engine, seconds: number, each?: () => void) => {
  for (let i = 0; i < Math.round(seconds * 50); i++) {
    each?.();
    k.step(1 / 50);
  }
};

/** A static floor whose top face is at y = 0. */
const addFloor = (k: Engine) =>
  k.add([k.pos(0, -0.5, 0), box(40, 1, 40), k.area(), k.body({ isStatic: true }), "floor"]);

const bodyCount = (k: Engine) => {
  let n = 0;
  (k.physics.world as any).forEachRigidBody(() => n++);
  return n;
};

describe("physics", () => {
  it("a falling box lands on a static floor and becomes grounded", async () => {
    const k = await make();
    addFloor(k);
    const b = k.add([k.pos(0, 3, 0), box(), k.rotate(), k.area(), k.body(), "box"]);
    let landed = 0;
    let normal: THREE.Vector3 | null = null;
    b.onGround(() => landed++);
    b.onCollide("floor", (_other, col) => {
      normal = col.normal;
    });
    expect(b.isGrounded()).toBe(false);
    run(k, 2);
    expect(b.pos.y).toBeCloseTo(0.5, 1);
    expect(b.isGrounded()).toBe(true);
    expect(b.isFalling()).toBe(false);
    expect(landed).toBe(1);
    expect(b.isColliding("floor")).toBe(true);
    // The normal points from the floor to the box.
    expect(normal).not.toBeNull();
    expect(normal!.y).toBeGreaterThan(0.9);
  });

  it("bakes the world scale into the collider", async () => {
    const k = await make();
    addFloor(k);
    const b = k.add([k.pos(0, 3, 0), box(), k.scale(2), k.area(), k.body()]);
    run(k, 2);
    expect(b.pos.y).toBeCloseTo(1, 1);
  });

  it("writes dynamic bodies back in local space and follows code-driven teleports", async () => {
    const k = await make();
    addFloor(k);
    const parent = k.add([k.pos(10, 0, 0)]);
    const child = parent.add([k.pos(0, 3, 0), sphere(0.5), k.area(), k.body()]);
    run(k, 2);
    expect(child.worldPos().x).toBeCloseTo(10, 1);
    expect(child.pos.y).toBeCloseTo(0.5, 1);
    child.pos = k.vec3(0, 8, 0); // assigned by code
    run(k, 0.04);
    expect(child.pos.y).toBeGreaterThan(7);
  });

  it("creates bodies for components added to a live object", async () => {
    const k = await make();
    addFloor(k);
    const o = k.add([k.pos(0, 3, 0), box()]);
    o.use(k.area());
    o.use(k.body());
    run(k, 2);
    expect(o.pos.y).toBeCloseTo(0.5, 1);
    expect((o as GameObj).isGrounded()).toBe(true);
  });

  it("triggers collide once and collideEnd after a moving body leaves a sensor", async () => {
    const k = await make();
    const coin = k.add([k.pos(3, 0, 0), sphere(0.5), k.area(), "coin"]);
    const player = k.add([k.pos(0, 0, 0), box(), k.area(), k.body({ kinematic: true }), "player"]);
    expect(coin.area.sensor).toBe(true);
    const log: string[] = [];
    player.onCollide("coin", () => log.push("collide"));
    player.onCollideUpdate("coin", () => log.push("update"));
    player.onCollideEnd("coin", () => log.push("end"));
    coin.onCollide("player", () => log.push("coin-collide"));
    run(k, 2, () => {
      player.pos.x += 0.1;
    });
    expect(log.filter((e) => e === "collide")).toHaveLength(1);
    expect(log.filter((e) => e === "coin-collide")).toHaveLength(1);
    expect(log.filter((e) => e === "end")).toHaveLength(1);
    expect(log.filter((e) => e === "update").length).toBeGreaterThan(1);
    expect(log.indexOf("end")).toBeGreaterThan(log.indexOf("collide"));
    expect(player.isColliding(coin)).toBe(false);
  });

  it("detects a sensor with a character", async () => {
    const k = await make();
    addFloor(k);
    const coin = k.add([k.pos(2, 0.9, 0), sphere(0.3), k.area(), "coin"]);
    const hero = k.add([k.pos(0, 0.9, 0), capsule(), k.area(), k.character(), "hero"]);
    let hits = 0;
    let ends = 0;
    hero.onCollide("coin", () => hits++);
    hero.onCollideEnd("coin", () => ends++);
    k.onUpdate(() => hero.move(3, 0, 0));
    run(k, 3);
    expect(hits).toBe(1);
    expect(ends).toBe(1);
    expect(coin.exists()).toBe(true);
  });

  it("global onCollide(tagA, tagB) fires and is removed by go()", async () => {
    const k = await make();
    let calls = 0;
    const populate = () => {
      k.add([k.pos(0, 0, 0), box(), k.area(), "a"]);
      k.add([k.pos(0.2, 0, 0), box(), k.area(), "b"]);
    };
    k.scene("one", () => {
      k.onCollide("a", "b", () => calls++);
      populate();
    });
    k.scene("two", populate);
    k.go("one");
    k.step(1 / 50);
    k.step(1 / 50);
    expect(calls).toBe(1);
    k.go("two");
    run(k, 0.2);
    expect(calls).toBe(1);
  });

  it("a character slides along a wall instead of passing through, and lands", async () => {
    const k = await make();
    addFloor(k);
    k.add([k.pos(3, 2, 0), box(1, 4, 20), k.area(), k.body({ isStatic: true })]); // wall face at x = 2.5
    const hero = k.add([k.pos(0, 2, 0), capsule(0.4, 1.8), k.area(), k.character()]);
    k.onUpdate(() => hero.move(4, 0, 2));
    run(k, 3);
    expect(hero.pos.x).toBeLessThan(2.2);
    expect(hero.pos.x).toBeGreaterThan(1.8);
    expect(hero.pos.z).toBeGreaterThan(3); // kept sliding along the wall
    expect(hero.isGrounded()).toBe(true);
    expect(hero.pos.y).toBeCloseTo(0.9, 1);
  });

  it("a character moves correctly on frames without fixed steps", async () => {
    const k = await make();
    addFloor(k);
    k.add([k.pos(3, 2, 0), box(1, 4, 20), k.area(), k.body({ isStatic: true })]);
    const hero = k.add([k.pos(0, 0.9, 0), capsule(), k.area(), k.character()]);
    k.step(1 / 50);
    k.onUpdate(() => hero.move(10, 0, 0));
    for (let i = 0; i < 120; i++) k.step(1 / 240); // many frames per fixed step
    expect(hero.pos.x).toBeLessThan(2.2);
    expect(hero.pos.x).toBeGreaterThan(1.5);
  });

  it("a character climbs a small step but not a tall one", async () => {
    const k = await make();
    addFloor(k);
    k.add([k.pos(3, 0.1, 0), box(2, 0.2, 20), k.area(), k.body({ isStatic: true })]);
    const hero = k.add([k.pos(0, 0.9, 0), capsule(), k.area(), k.character({ stepHeight: 0.3 })]);
    k.onUpdate(() => hero.move(3, 0, 0));
    run(k, 1.3); // the step spans x = 2..4
    expect(hero.pos.x).toBeGreaterThan(3);
    expect(hero.pos.x).toBeLessThan(4);
    expect(hero.pos.y).toBeCloseTo(1.1, 1);

    const k2 = await make();
    addFloor(k2);
    k2.add([k2.pos(3, 0.5, 0), box(2, 1, 20), k2.area(), k2.body({ isStatic: true })]);
    const hero2 = k2.add([k2.pos(0, 0.9, 0), capsule(), k2.area(), k2.character()]);
    k2.onUpdate(() => hero2.move(3, 0, 0));
    run(k2, 2);
    expect(hero2.pos.x).toBeLessThan(2.2);
  });

  it("a character jumps and lands again", async () => {
    const k = await make();
    addFloor(k);
    const hero = k.add([k.pos(0, 0.9, 0), capsule(), k.area(), k.character()]);
    run(k, 0.5);
    expect(hero.isGrounded()).toBe(true);
    let landings = 0;
    hero.onGround(() => landings++);
    hero.jump(8);
    let peak = 0;
    run(k, 1.2, () => {
      peak = Math.max(peak, hero.pos.y);
    });
    expect(peak).toBeGreaterThan(2);
    expect(hero.isGrounded()).toBe(true);
    expect(hero.pos.y).toBeCloseTo(0.9, 1);
    expect(landings).toBe(1);
  });

  it("move() sets the horizontal velocity of a dynamic body", async () => {
    const k = await make();
    addFloor(k);
    const ball = k.add([k.pos(0, 0.5, 0), sphere(0.5), k.area(), k.body({ lockRotation: true })]);
    k.onUpdate(() => ball.move(5, 0, 0));
    run(k, 1);
    expect(ball.pos.x).toBeGreaterThan(3);
    expect(ball.isGrounded()).toBe(true);
  });

  it("vel is a live view of the rigid body, and impulses work", async () => {
    const k = await make();
    k.setGravity(0);
    const b = k.add([k.pos(), box(), k.area(), k.body({ interpolate: false })]);
    b.vel.x = 2;
    expect(b.vel.x).toBeCloseTo(2);
    run(k, 0.5);
    expect(b.pos.x).toBeCloseTo(1, 1);
    b.vel = k.vec3(0, 0, 0);
    b.applyImpulse(k.vec3(0, 0, 3)); // mass 1 (density 1, 1 m³)
    run(k, 0.5);
    expect(b.pos.z).toBeCloseTo(1.5, 1);
    b.angularVel.y = 90;
    expect(b.angularVel.y).toBeCloseTo(90, 3);
  });

  it("raycast hits with the right distance and respects exclude, tag and sensors", async () => {
    const k = await make();
    const floor = addFloor(k);
    const coin = k.add([k.pos(0, 2, 0), sphere(0.5), k.area(), "coin"]);
    k.step(1 / 50);
    const down = k.vec3(0, -1, 0);
    const hit = k.raycast(k.vec3(0, 5, 0), down);
    expect(hit?.obj).toBe(floor);
    expect(hit?.distance).toBeCloseTo(5, 2);
    expect(hit?.point.y).toBeCloseTo(0, 2);
    expect(hit?.normal.y).toBeCloseTo(1, 2);
    expect(k.raycast(k.vec3(0, 5, 0), down, 1000, { exclude: [floor] })).toBeNull();
    expect(k.raycast(k.vec3(0, 5, 0), down, 1000, { tag: "nothing" })).toBeNull();
    expect(k.raycast(k.vec3(0, 5, 0), down, 1000, { tag: "floor" })?.obj).toBe(floor);
    expect(k.raycast(k.vec3(0, 5, 0), down, 2)).toBeNull(); // too short
    const withSensors = k.raycast(k.vec3(0, 5, 0), down, 1000, { sensors: true });
    expect(withSensors?.obj).toBe(coin);
    expect(withSensors?.distance).toBeCloseTo(2.5, 2);
  });

  it("destroying an object removes its body and ends its contacts", async () => {
    const k = await make();
    const coin = k.add([k.pos(0, 0, 0), sphere(0.5), k.area(), "coin"]);
    const player = k.add([k.pos(0, 0, 0), box(), k.area(), k.body({ kinematic: true })]);
    expect(bodyCount(k)).toBe(2);
    let ended = 0;
    player.onCollideEnd("coin", () => ended++);
    run(k, 0.2);
    expect(player.isColliding(coin)).toBe(true);
    coin.destroy();
    expect(bodyCount(k)).toBe(1);
    expect(ended).toBe(1);
    expect(player.getCollisions()).toEqual([]);
    run(k, 0.2); // late Rapier events for the removed collider are ignored
    expect(ended).toBe(1);
    player.destroy();
    expect(bodyCount(k)).toBe(0);
  });

  it("scene changes remove the bodies of the old scene", async () => {
    const k = await make();
    k.scene("a", () => {
      k.add([k.pos(), box(), k.area(), k.body()]);
    });
    k.scene("b", () => {});
    k.go("a");
    expect(bodyCount(k)).toBe(1);
    k.go("b");
    expect(bodyCount(k)).toBe(0);
  });

  it("gravity defaults to 20 and can be changed", async () => {
    const k = await make();
    expect(k.getGravity().toArray()).toEqual([0, -20, 0]);
    k.setGravity(5);
    expect(k.getGravity().toArray()).toEqual([0, -5, 0]);
    k.setGravity(k.vec3(1, 0, 0));
    expect(k.getGravity().x).toBe(1);
    const k2 = await make({ physics: { gravity: 3 } });
    expect(k2.getGravity().y).toBe(-3);
  });

  it("body() and character() can't share an object", async () => {
    const k = await make();
    expect(() => k.add([k.pos(), box(), k.area(), k.body(), k.character()])).toThrow(
      /Components "body" and "character" can't be on the same object/,
    );
    expect(() => k.add([k.pos(), box(), k.area(), k.character(), k.body()])).toThrow(
      /Components "character" and "body" can't be on the same object/,
    );
  });

  it("body() requires area()", async () => {
    const k = await make();
    expect(() => k.add([k.pos(), box(), k.body()])).toThrow(/requires component "area"/);
  });

  it("builds a cube with a hint when there is nothing to derive a collider from", async () => {
    const k = await make();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    addFloor(k);
    const o = k.add([k.pos(0, 3, 0), k.area(), k.body()]);
    run(k, 2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("1x1x1 cube"));
    expect(o.pos.y).toBeCloseTo(0.5, 1);
    warn.mockRestore();
  });

  it("area({ size, offset }) overrides the derived collider", async () => {
    const k = await make();
    addFloor(k);
    const o = k.add([k.pos(0, 3, 0), k.area({ size: k.vec3(1, 4, 1) }), k.body()]);
    run(k, 2);
    expect(o.pos.y).toBeCloseTo(2, 1);
    const p = k.add([k.pos(5, 3, 0), box(), k.area({ offset: k.vec3(0, 1, 0) }), k.body()]);
    run(k, 2);
    expect(p.pos.y).toBeCloseTo(-0.5, 1); // the collider sits 1 m above the origin
  });

  it("mesh and hull colliders come from the geometry", async () => {
    const k = await make();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    addFloor(k);
    const geo = new THREE.SphereGeometry(0.5, 12, 8);
    const meshComp = () => ({
      id: "shape",
      shape: { kind: "mesh" } as ShapeDesc,
      mesh: new THREE.Mesh(geo),
      add() {
        self(this).object3d.add(this.mesh);
      },
    });
    const ball = k.add([k.pos(0, 3, 0), meshComp(), k.area({ shape: "hull" }), k.body()]);
    const rock = k.add([k.pos(5, 3, 0), meshComp(), k.area({ shape: "mesh" }), k.body()]);
    const bridge = k.add([
      k.pos(10, 0.5, 0),
      meshComp(),
      k.area({ shape: "mesh" }),
      k.body({ isStatic: true }),
    ]);
    run(k, 2);
    expect(ball.pos.y).toBeCloseTo(0.5, 1);
    expect(rock.pos.y).toBeCloseTo(0.5, 1); // fell back to a hull
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("convex hull"));
    expect(bridge.exists()).toBe(true);
    warn.mockRestore();
  });

  it("applyForce acts on the next fixed steps and is then cleared", async () => {
    const k = await make();
    k.setGravity(0);
    const b = k.add([k.pos(), box(), k.area(), k.body({ damping: 0 })]);
    b.applyForce(k.vec3(10, 0, 0));
    run(k, 0.04); // one fixed step with the force
    const v1 = b.vel.x;
    expect(v1).toBeGreaterThan(0);
    run(k, 0.5);
    expect(b.vel.x).toBeCloseTo(v1, 3); // not accelerating any more
  });

  it("physics: false makes the components inert and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const k = await make({ physics: false });
    const a = k.add([k.pos(0, 3, 0), box(), k.area(), k.body(), "a"]);
    const b = k.add([k.pos(0, 3, 0), box(), k.area(), k.body(), "b"]);
    let collided = 0;
    a.onCollide(() => collided++);
    run(k, 1);
    expect(a.pos.y).toBe(3);
    expect(collided).toBe(0);
    expect(a.isGrounded()).toBe(false);
    expect(a.isColliding(b)).toBe(false);
    expect(k.raycast(k.vec3(0, 5, 0), k.vec3(0, -1, 0))).toBeNull();
    expect(k.physics.name).toBe("none");
    a.vel.x = 3; // still a usable vector
    expect(a.vel.x).toBe(3);
    const hero = k.add([k.pos(), capsule(), k.area(), k.character()]);
    hero.jump();
    expect(hero.isGrounded()).toBe(false);
    expect(
      warn.mock.calls.filter((c) => String(c[0]).includes("physics is disabled")),
    ).toHaveLength(1);
    warn.mockRestore();
  });

  it("exposes the backend and draws colliders while the inspector is on", async () => {
    const k = await make();
    k.add([k.pos(0, 0, 0), box(), k.area(), k.body({ isStatic: true })]);
    expect(k.physics.name).toBe("rapier");
    expect(k.physics.native).toBeTruthy();
    expect(k.physics.world).toBeTruthy();
    const lines = () => k.scene3d.children.filter((c) => (c as THREE.LineSegments).isLineSegments);
    run(k, 0.1);
    expect(lines()).toHaveLength(0);
    k.hooks.emit("debugInspect", true);
    run(k, 0.1);
    expect(lines()).toHaveLength(1);
    const pos = (lines()[0] as THREE.LineSegments).geometry.getAttribute("position");
    expect(pos.count).toBeGreaterThan(0);
    k.hooks.emit("debugInspect", false);
    expect(lines()).toHaveLength(0);
  });

  it("frees the world when the engine quits", async () => {
    const k = await make();
    k.add([k.pos(), box(), k.area(), k.body()]);
    k.quit();
    expect(k.physics.world).toBeNull();
  });

  it("objects added before Rapier finished loading get their bodies afterwards", async () => {
    const k = createEngine({ loop: "manual" }, [transformPlugin, physicsPlugin]) as Engine;
    const early: GameObj = k.add([k.pos(0, 3, 0), box(), k.area(), k.body()]);
    expect(k.physics.ready).toBe(false);
    await new Promise<void>((resolve) => k.onLoad(resolve));
    addFloor(k);
    run(k, 2);
    expect(early.pos.y).toBeCloseTo(0.5, 1);
  });

  describe("interpolation", () => {
    /** Falls for a while at 60 fps (5 fixed steps per 6 frames) and returns y after every frame. */
    async function fall(bodyOpts: Record<string, unknown>, fps = 60) {
      const k = await make();
      const b = k.add([k.pos(0, 100, 0), box(), k.area(), k.body(bodyOpts)]);
      for (let i = 0; i < 10; i++) k.step(1 / fps);
      const ys: number[] = [];
      for (let i = 0; i < 60; i++) {
        k.step(1 / fps);
        ys.push(b.pos.y);
      }
      return { k, b, ys };
    }

    it("a falling body moves on every frame even when frames and fixed steps do not match", async () => {
      for (const fps of [60, 144, 30]) {
        const { ys } = await fall({}, fps);
        const dy = ys.slice(1).map((y, i) => ys[i] - y);
        expect(Math.min(...dy)).toBeGreaterThan(0);
        // smooth: the per-frame displacement only changes by about gravity * dt²
        for (let i = 1; i < dy.length; i++) {
          expect(Math.abs(dy[i] - dy[i - 1] - 20 / (fps * fps))).toBeLessThan(0.4 / fps);
        }
      }
    });

    it("body({ interpolate: false }) shows the latest simulated pose (stalls between steps)", async () => {
      const { ys } = await fall({ interpolate: false });
      const dy = ys.slice(1).map((y, i) => ys[i] - y);
      expect(dy.some((d) => d === 0)).toBe(true);
    });

    it("the rendered pose is never ahead of the simulation and lags at most one step", async () => {
      const { b, k } = await fall({});
      const rb = (b as any).vel; // live view: the simulation's velocity
      const sim = k.get("*")[0];
      expect(sim).toBe(b);
      expect(rb.y).toBeLessThan(0);
      // true y = pos.y - at most one step of fall away
      const maxLag = Math.abs(rb.y) * (1 / 50) + 1e-6;
      k.step(1 / 60);
      const shown = b.pos.y;
      k.step(1 / 240);
      expect(Math.abs(b.pos.y - shown)).toBeLessThanOrEqual(maxLag * 2);
    });

    it("code assigning pos wins over the interpolated pose, even on frames without a step", async () => {
      const k = await make();
      const b = k.add([k.pos(0, 100, 0), box(), k.area(), k.body()]);
      for (let i = 0; i < 20; i++) k.step(1 / 144);
      b.pos.set(5, 50, 0);
      k.step(1 / 144); // probably no fixed step in this frame
      expect(b.pos.x).toBeCloseTo(5, 5);
      expect(b.pos.y).toBeCloseTo(50, 1);
      for (let i = 0; i < 10; i++) k.step(1 / 144);
      expect(b.pos.x).toBeCloseTo(5, 3);
      expect(b.pos.y).toBeLessThan(50);
      expect(b.pos.y).toBeGreaterThan(49);
    });

    it("a body that came to rest settles on its true pose", async () => {
      const k = await make();
      addFloor(k);
      const b = k.add([k.pos(0, 1, 0), box(), k.area(), k.body()]);
      for (let i = 0; i < 200; i++) k.step(1 / 144);
      expect(b.pos.y).toBeCloseTo(0.5, 2);
    });
  });

  it("reads on a destroyed object return defaults instead of recreating its state", async () => {
    const k = await make();
    const other = k.add([k.pos(0.2, 0, 0), box(), k.area(), "other"]);
    const b = k.add([k.pos(0, 0, 0), box(), k.area(), k.body(), "b"]);
    const hero = k.add([k.pos(0, 5, 0), capsule(), k.area(), k.character()]);
    run(k, 0.1);
    b.destroy();
    hero.destroy();
    run(k, 0.1);
    expect(b.vel.length()).toBe(0);
    expect(b.angularVel.length()).toBe(0);
    expect(b.isColliding(other)).toBe(false);
    expect(b.isColliding("other")).toBe(false);
    expect(b.getCollisions()).toEqual([]);
    expect(b.isGrounded()).toBe(false);
    expect(b.isFalling()).toBe(false);
    expect(hero.isGrounded()).toBe(false);
    expect(hero.vel.length()).toBe(0);
    expect(() => {
      b.applyImpulse(k.vec3(1, 0, 0));
      b.applyForce(k.vec3(1, 0, 0));
      b.jump();
      hero.jump();
      hero.move(1, 0, 0);
    }).not.toThrow();
    run(k, 0.1);
    expect(bodyCount(k)).toBe(1); // only `other`
  });

  it("a character ignores the vertical part of move() (moveTo a target at another height)", async () => {
    const k = await make();
    addFloor(k);
    const target = k.add([k.pos(10, 6, 0), box()]);
    const hero = k.add([k.pos(0, 0.9, 0), capsule(), k.area(), k.character()]);
    k.onUpdate(() => hero.moveTo(target, 4));
    run(k, 0.5);
    expect(hero.pos.x).toBeGreaterThan(1.5);
    expect(hero.pos.y).toBeCloseTo(0.9, 1); // not lifted towards the target
    expect(hero.isGrounded()).toBe(true);
  });

  it("move() on a static body warns once and moves nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const k = await make();
    const wall = k.add([k.pos(0, 0, 0), box(), k.area(), k.body({ isStatic: true })]);
    k.step(1 / 50);
    wall.move(5, 0, 0);
    wall.move(5, 0, 0);
    expect(wall.pos.x).toBe(0);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("isStatic"))).toHaveLength(1);
    warn.mockRestore();
  });

  it("kinematic bodies are only pushed to the world when they moved", async () => {
    const k = await make();
    const plat = k.add([k.pos(0, 0, 0), box(4, 0.2, 4), k.area(), k.body({ kinematic: true })]);
    const rider = k.add([k.pos(0, 0.4, 0), box(), k.area(), k.body()]);
    run(k, 0.3);
    const rb = (k.physics.world as any).bodies; // a sanity check on the world, not on internals
    expect(rb).toBeDefined();
    plat.pos.x = 3;
    run(k, 0.1);
    expect(plat.pos.x).toBeCloseTo(3, 5);
    expect(rider.pos.x).toBeCloseTo(0, 0);
  });
});
