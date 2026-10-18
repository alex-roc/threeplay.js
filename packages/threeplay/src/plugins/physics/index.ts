import { Vector3 } from "three";
import { definePlugin } from "../../core/engine";
import type { Engine, EventController, GameObj, Tag } from "../../core/types";
import { self } from "../../core/util";
import type { Vec3Like } from "../transform/types";
import { DebugLines } from "./debug";
import { RapierBackend } from "./rapier";
import { isSensorOf } from "./state";
import { PhysicsSystem } from "./system";
import type {
  AreaComp,
  AreaOpts,
  BodyComp,
  BodyOpts,
  CharacterComp,
  CharacterOpts,
  Collision,
  PhysicsAPI,
  PhysicsBackend,
  RaycastOpts,
} from "./types";

export type * from "./types";

/** Default gravity strength (units/s², pulling down). */
const DEFAULT_GRAVITY = 20;
/** Default `jump()` speed of bodies. */
const DEFAULT_JUMP = 8;

type ObjFn = (other: GameObj, col: Collision) => void;

/** `on(event, [tag,] fn)` for object events whose first argument is the other object. */
function listen(
  obj: GameObj,
  event: string,
  tagOrFn: Tag | ((...a: any[]) => void),
  fn?: (...a: any[]) => void,
): EventController {
  if (typeof tagOrFn === "function") return obj.on(event, tagOrFn);
  return obj.on(event, (other: GameObj, ...rest: unknown[]) => {
    if (other.is(tagOrFn)) fn!(other, ...rest);
  });
}

/** Built-in plugin: `area`, `body` and `character` on top of Rapier. */
export const physicsPlugin = definePlugin<PhysicsAPI>({
  name: "physics",
  dependencies: ["transform"],
  install(k: Engine) {
    const opt = k.opts.physics;
    const cfg = typeof opt === "object" && opt !== null ? opt : {};
    const rapier = opt === false ? null : new RapierBackend();
    const sys = new PhysicsSystem(rapier);

    // Without Rapier the API still exists, but nothing moves or collides.
    const gravity = new Vector3(0, -DEFAULT_GRAVITY, 0);
    const inert: PhysicsBackend = {
      name: "none",
      ready: false,
      world: null,
      native: null,
      init: async () => {},
      setGravity: (g) => void gravity.copy(g),
      getGravity: () => gravity.clone(),
      step: () => {},
      dispose: () => {},
    };
    const physics: PhysicsBackend = rapier ?? inert;
    const toGravity = (g: number | Vec3Like) =>
      typeof g === "number" ? new Vector3(0, -g, 0) : new Vector3(g.x, g.y, g.z);
    physics.setGravity(toGravity(cfg.gravity ?? DEFAULT_GRAVITY));

    if (rapier) {
      // Rapier is a dynamic import: it lands in its own chunk and loads in parallel.
      k.load(rapier.init());
      const debug = new DebugLines(k, rapier);
      k.hooks.on("beforeFixedUpdate", () => sys.beforeFixed());
      k.hooks.on("afterFixedUpdate", (dt) => sys.afterFixed(dt));
      k.hooks.on("beforeUpdate", () => sys.beforeUpdate());
      // Characters move first, so the camera (installed later) sees final positions.
      k.hooks.on("afterUpdate", (dt) => sys.afterUpdate(dt));
      k.hooks.on("afterUpdate", () => debug.update());
      k.hooks.on("debugInspect", (on) => debug.set(on));
      k.hooks.on("objectAdd", (obj) => sys.flushObject(obj));
      k.onQuit(() => {
        debug.set(false);
        physics.dispose();
      });
    }

    /** Components shared by `body()` and `character()`. */
    const stateOf = (o: unknown) => sys.ensure(self(o));

    function area(opts: AreaOpts = {}): AreaComp {
      let owner: GameObj | null = null;
      return {
        id: "area",
        area: {
          shape: opts.shape ?? "auto",
          get sensor() {
            return owner ? isSensorOf(sys.ensure(owner)) : (opts.sensor ?? true);
          },
        },
        onCollide(tagOrFn: Tag | ObjFn, fn?: ObjFn) {
          return listen(self(this), "collide", tagOrFn, fn);
        },
        onCollideUpdate(tagOrFn: Tag | ObjFn, fn?: ObjFn) {
          return listen(self(this), "collideUpdate", tagOrFn, fn);
        },
        onCollideEnd(tagOrFn: Tag | ((other: GameObj) => void), fn?: (other: GameObj) => void) {
          return listen(self(this), "collideEnd", tagOrFn, fn);
        },
        isColliding(other: GameObj | Tag) {
          const touching = stateOf(this).touching;
          if (typeof other !== "string") return touching.has(other);
          for (const o of touching.keys()) if (o.is(other)) return true;
          return false;
        },
        getCollisions() {
          return [...stateOf(this).touching.keys()];
        },
        add() {
          owner = self(this);
          sys.warnDisabled("area");
          const s = sys.ensure(owner);
          s.area = opts;
          sys.markDirty(s);
        },
        destroy() {
          sys.remove(self(this));
          owner = null;
        },
        inspect() {
          const s = sys.states.get(self(this));
          if (!s) return null;
          const kind = s.rb ? s.kind : sys.enabled ? "pending" : "off";
          return `${kind}${isSensorOf(s) ? " (sensor)" : ""}, touching ${s.touching.size}`;
        },
      };
    }

    /** Re-reads the body kind when `body()`/`character()` come or go on a live object. */
    function bodyLifecycle(
      id: "body" | "character",
      set: (s: ReturnType<typeof stateOf>) => void,
      clear: (s: ReturnType<typeof stateOf>) => void,
    ) {
      return {
        add(this: GameObj) {
          sys.warnDisabled(id);
          const other = id === "body" ? "character" : "body";
          if (this.has(other)) {
            throw new Error(
              `${id}() and ${other}() can't be used on the same object: a character is already a kinematic body. Remove one of them.`,
            );
          }
          const s = sys.ensure(this);
          set(s);
          sys.markDirty(s);
        },
        destroy(this: GameObj) {
          if (!this.exists()) return; // the whole object is going away: area() cleans up
          const s = sys.states.get(this);
          if (!s) return;
          clear(s);
          sys.markDirty(s);
        },
      };
    }

    function body(opts: BodyOpts = {}): BodyComp {
      return {
        id: "body",
        require: ["area"],
        get vel() {
          return sys.velocityOf(stateOf(this));
        },
        set vel(v: Vector3) {
          sys.velocityOf(stateOf(this)).copy(v);
        },
        get angularVel() {
          return sys.angularVelocityOf(stateOf(this));
        },
        set angularVel(v: Vector3) {
          sys.angularVelocityOf(stateOf(this)).copy(v);
        },
        applyImpulse(f: Vec3Like) {
          stateOf(this).rb?.applyImpulse({ x: f.x, y: f.y, z: f.z }, true);
        },
        applyForce(f: Vec3Like) {
          sys.applyForce(stateOf(this), f);
        },
        applyTorqueImpulse(t: Vec3Like) {
          stateOf(this).rb?.applyTorqueImpulse({ x: t.x, y: t.y, z: t.z }, true);
        },
        jump(force = DEFAULT_JUMP) {
          sys.velocityOf(stateOf(this)).y = force;
        },
        isGrounded() {
          return sys.probeGround(stateOf(this));
        },
        isFalling() {
          const s = stateOf(this);
          return sys.velocityOf(s).y < 0 && !sys.probeGround(s);
        },
        onGround(fn: () => void) {
          const obj = self(this);
          sys.watchGround(sys.ensure(obj));
          return obj.on("ground", fn);
        },
        teleport(to: Vec3Like) {
          sys.teleport(stateOf(this), to);
        },
        applyMove(delta: Vector3, velocity: Vector3) {
          sys.moveBody(stateOf(this), delta, velocity);
        },
        ...bodyLifecycle(
          "body",
          (s) => {
            s.body = opts;
          },
          (s) => {
            s.body = null;
          },
        ),
        inspect() {
          const s = stateOf(this);
          const v = sys.velocityOf(s);
          return `${s.rb ? s.kind : "pending"}, v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
        },
      };
    }

    function character(opts: CharacterOpts = {}): CharacterComp {
      const jumpForce = opts.jumpForce ?? DEFAULT_JUMP;
      return {
        id: "character",
        require: ["area"],
        get vel() {
          return stateOf(this).vel;
        },
        set vel(v: Vector3) {
          stateOf(this).vel.copy(v);
        },
        jump(force = jumpForce) {
          stateOf(this).vel.y = force;
        },
        isGrounded() {
          return stateOf(this).grounded;
        },
        isFalling() {
          const s = stateOf(this);
          return !s.grounded && s.vel.y < 0;
        },
        onGround(fn: () => void) {
          return self(this).on("ground", fn);
        },
        teleport(to: Vec3Like) {
          sys.teleport(stateOf(this), to);
        },
        applyMove(delta: Vector3) {
          sys.moveCharacter(stateOf(this), delta);
        },
        ...bodyLifecycle(
          "character",
          (s) => {
            s.character = opts;
          },
          (s) => {
            s.character = null;
          },
        ),
        inspect() {
          const s = stateOf(this);
          return `${s.grounded ? "grounded" : "airborne"}, vy=${s.vel.y.toFixed(1)}`;
        },
      };
    }

    // Global collision listeners ride on the per-tag routing of object events,
    // so they are scene-scoped like every other `k.on`.
    const pairListener =
      (event: string) =>
      (tagA: Tag, tagB: Tag, fn: (a: GameObj, b: GameObj, col: any) => void): EventController =>
        k.on(event, tagA, (a: GameObj, b: GameObj, col: unknown) => {
          if (b.is(tagB)) fn(a, b, col);
        });

    return {
      physics,
      area,
      body,
      character,
      setGravity(g: number | Vec3Like) {
        physics.setGravity(toGravity(g));
      },
      getGravity: () => physics.getGravity(),
      raycast(origin: Vec3Like, dir: Vec3Like, maxDist = 1000, opts: RaycastOpts = {}) {
        return sys.raycast(origin, dir, maxDist, opts);
      },
      onCollide: pairListener("collide"),
      onCollideUpdate: pairListener("collideUpdate"),
      onCollideEnd: pairListener("collideEnd"),
    };
  },
});
