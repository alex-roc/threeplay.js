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

/**
 * Both `body()` and `character()` carry this property. The core refuses two components
 * that define the same property and names it in the error, so combining them fails with
 * a readable message (the property names read as the explanation).
 */

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
      k.hooks.on("frameStart", (dt) => sys.frameStart(dt));
      k.hooks.on("beforeFixedUpdate", () => sys.beforeFixed());
      k.hooks.on("afterFixedUpdate", (dt) => sys.afterFixed(dt));
      // Dynamic bodies get their interpolated pose here, before `update` and the camera.
      k.hooks.on("beforeUpdate", () => sys.beforeUpdate(k.fixedDt()));
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

    /**
     * The state of an object, without creating it: after `destroy()` it is gone
     * and calls must neither resurrect it nor leak the object.
     */
    const stateOf = (o: unknown) => sys.states.get(self(o));
    type State = NonNullable<ReturnType<typeof stateOf>>;

    function area(opts: AreaOpts = {}): AreaComp {
      let owner: GameObj | null = null;
      return {
        id: "area",
        area: {
          shape: opts.shape ?? "auto",
          get sensor() {
            const s = owner ? sys.states.get(owner) : undefined;
            return s ? isSensorOf(s) : (opts.sensor ?? true);
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
          const touching = stateOf(this)?.touching;
          if (!touching) return false;
          if (typeof other !== "string") return touching.has(other);
          for (const o of touching.keys()) if (o.is(other)) return true;
          return false;
        },
        getCollisions() {
          const touching = stateOf(this)?.touching;
          return touching ? [...touching.keys()] : [];
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
          const s = stateOf(this);
          if (!s) return null;
          const kind = s.rb ? s.kind : sys.enabled ? "pending" : "off";
          return `${kind}${isSensorOf(s) ? " (sensor)" : ""}, touching ${s.touching.size}`;
        },
      };
    }

    /** Re-reads the body kind when `body()`/`character()` come or go on a live object. */
    function bodyLifecycle(
      id: "body" | "character",
      set: (s: State) => void,
      clear: (s: State) => void,
    ) {
      return {
        add(this: GameObj) {
          sys.warnDisabled(id);
          const s = sys.ensure(this);
          set(s);
          sys.markDirty(s);
        },
        destroy(this: GameObj) {
          if (!this.exists()) return; // the whole object is going away: area() cleans up
          const s = stateOf(this);
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
        conflicts: ["character"],
        get vel() {
          const s = stateOf(this);
          return s ? sys.velocityOf(s) : new Vector3();
        },
        set vel(v: Vector3) {
          const s = stateOf(this);
          if (s) sys.velocityOf(s).copy(v);
        },
        get angularVel() {
          const s = stateOf(this);
          return s ? sys.angularVelocityOf(s) : new Vector3();
        },
        set angularVel(v: Vector3) {
          const s = stateOf(this);
          if (s) sys.angularVelocityOf(s).copy(v);
        },
        applyImpulse(f: Vec3Like) {
          stateOf(this)?.rb?.applyImpulse({ x: f.x, y: f.y, z: f.z }, true);
        },
        applyForce(f: Vec3Like) {
          const s = stateOf(this);
          if (s) sys.applyForce(s, f);
        },
        applyTorqueImpulse(t: Vec3Like) {
          stateOf(this)?.rb?.applyTorqueImpulse({ x: t.x, y: t.y, z: t.z }, true);
        },
        jump(force = DEFAULT_JUMP) {
          const s = stateOf(this);
          if (s) sys.velocityOf(s).y = force;
        },
        isGrounded() {
          const s = stateOf(this);
          return s ? sys.probeGround(s) : false;
        },
        isFalling() {
          const s = stateOf(this);
          return s ? sys.velocityOf(s).y < 0 && !sys.probeGround(s) : false;
        },
        onGround(fn: () => void) {
          const obj = self(this);
          const s = stateOf(obj);
          if (s) sys.watchGround(s);
          return obj.on("ground", fn);
        },
        teleport(to: Vec3Like) {
          const s = stateOf(this);
          if (s) sys.teleport(s, to);
        },
        applyMove(delta: Vector3, velocity: Vector3) {
          const s = stateOf(this);
          if (s) sys.moveBody(s, delta, velocity);
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
          if (!s) return null;
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
        conflicts: ["body"],
        get vel() {
          return stateOf(this)?.vel ?? new Vector3();
        },
        set vel(v: Vector3) {
          stateOf(this)?.vel.copy(v);
        },
        jump(force = jumpForce) {
          const s = stateOf(this);
          if (s) s.vel.y = force;
        },
        isGrounded() {
          return stateOf(this)?.grounded ?? false;
        },
        isFalling() {
          const s = stateOf(this);
          return s ? !s.grounded && s.vel.y < 0 : false;
        },
        onGround(fn: () => void) {
          return self(this).on("ground", fn);
        },
        teleport(to: Vec3Like) {
          const s = stateOf(this);
          if (s) sys.teleport(s, to);
        },
        applyMove(delta: Vector3) {
          const s = stateOf(this);
          if (s) sys.moveCharacter(s, delta);
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
          if (!s) return null;
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
