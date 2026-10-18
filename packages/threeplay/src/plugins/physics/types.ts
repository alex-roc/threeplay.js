import type * as THREE from "three";
import type { Comp, EventController, GameObj, Tag } from "../../core/types";
import type { MoveHandler, Vec3Like } from "../transform/types";

/** A contact between two objects, as seen from one of them. */
export interface Collision {
  /** The other object. */
  other: GameObj;
  /** `true` if either collider is a sensor (no physical response). */
  sensor: boolean;
  /** Contact normal pointing from the other object to this one, when known. */
  normal: THREE.Vector3 | null;
}

/** Result of `raycast()`. */
export interface RaycastHit {
  obj: GameObj;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

/** Options of `area()`. */
export interface AreaOpts {
  /**
   * Collider shape. `"auto"` (default) derives it from the object's shape:
   * box → cuboid, sphere → ball, capsule → capsule, cylinder/cone → same,
   * plane → thin cuboid, mesh/model → bounding box.
   * `"mesh"` builds a trimesh (static objects only), `"hull"` a convex hull.
   */
  shape?: "auto" | "box" | "sphere" | "capsule" | "mesh" | "hull";
  /** Explicit size (local units, scaled with the object), overriding the derived one. */
  size?: Vec3Like;
  /** Offset of the collider from the object origin, in local units (scaled with the object). */
  offset?: Vec3Like;
  /** A sensor detects overlaps but nothing bounces off it. Default: `true` without `body()`. */
  sensor?: boolean;
  friction?: number;
  restitution?: number;
}

/** Fields added by `area()`. */
export interface AreaComp extends Comp {
  id: "area";
  area: { shape: string; sensor: boolean };
  /** When this object starts touching another (optionally with `tag`). */
  onCollide(tag: Tag, fn: (other: GameObj, col: Collision) => void): EventController;
  onCollide(fn: (other: GameObj, col: Collision) => void): EventController;
  /** Every fixed step while touching. */
  onCollideUpdate(tag: Tag, fn: (other: GameObj, col: Collision) => void): EventController;
  onCollideUpdate(fn: (other: GameObj, col: Collision) => void): EventController;
  /** When this object stops touching another. */
  onCollideEnd(tag: Tag, fn: (other: GameObj) => void): EventController;
  onCollideEnd(fn: (other: GameObj) => void): EventController;
  /** `true` while touching `other` (or any object with that tag). */
  isColliding(other: GameObj | Tag): boolean;
  /** Objects currently touching this one. */
  getCollisions(): GameObj[];
}

/** Options of `body()`. */
export interface BodyOpts {
  /** Never moves (floors, walls). */
  isStatic?: boolean;
  /** Moved only by code (`pos`/`move`), pushes dynamic bodies. */
  kinematic?: boolean;
  /** Mass in kg (default derived from collider volume). */
  mass?: number;
  /** Multiplies gravity for this body (default 1). */
  gravityScale?: number;
  /** Linear damping (air drag, default 0). */
  damping?: number;
  /** Angular damping (default 0.05). */
  angularDamping?: number;
  /** Prevent rotation (default `false`). Handy for player-like boxes. */
  lockRotation?: boolean;
  /** Continuous collision detection for fast objects (default `false`). */
  ccd?: boolean;
  /**
   * Dynamic bodies only: render the pose interpolated between the last two fixed
   * steps (default `true`). Without it motion looks jittery whenever the display
   * rate is not a multiple of the 50 Hz physics rate. Set `false` to make `pos`/`rot`
   * always hold the latest simulated pose, at the cost of that jitter.
   */
  interpolate?: boolean;
}

/**
 * Fields added by `body()`. Requires `area()`. It is a {@link MoveHandler}:
 * `move()` sets the horizontal velocity of dynamic bodies and translates
 * kinematic ones (static bodies ignore it, with a warning).
 *
 * Dynamic bodies are **interpolated**: from `update` on, `pos`/`rot` hold the
 * visual pose of the frame, up to one fixed step (20 ms) behind the simulation.
 * `fixedUpdate` and collision callbacks see the latest simulated pose, and
 * `raycast`, `vel` and `isGrounded()` always use the simulation. Assigning `pos`
 * or `rot` from code teleports the body. Opt out with `body({ interpolate: false })`.
 */
export interface BodyComp extends Comp, MoveHandler {
  id: "body";
  /** Linear velocity in units/s (read or assign). */
  vel: THREE.Vector3;
  /** Angular velocity in degrees/s. */
  angularVel: THREE.Vector3;
  applyImpulse(impulse: Vec3Like): void;
  applyForce(force: Vec3Like): void;
  applyTorqueImpulse(torque: Vec3Like): void;
  /** Sets the vertical velocity (default 8). */
  jump(force?: number): void;
  /** `true` if standing on something (ground probe below the collider). */
  isGrounded(): boolean;
  isFalling(): boolean;
  /** When the body lands. */
  onGround(fn: () => void): EventController;
  /** Teleports, resetting velocity. */
  teleport(to: Vec3Like): void;
}

/** Options of `character()`. */
export interface CharacterOpts {
  /** Highest step it climbs automatically (default 0.3). */
  stepHeight?: number;
  /** Steepest walkable slope in degrees (default 45). */
  maxSlope?: number;
  /** Snaps down to the ground on slopes and stairs (default 0.3). */
  snapToGround?: number;
  /** Multiplies world gravity (default 1). */
  gravityScale?: number;
  /** Default jump speed for `jump()` (default 8). */
  jumpForce?: number;
}

/**
 * Fields added by `character()`: a kinematic character controller.
 * `move()` (from `pos`) slides along walls instead of passing through; only its
 * horizontal (x/z) part is used, vertical motion comes from gravity and `jump()`.
 * Requires `area()`; do not combine with `body()`.
 */
export interface CharacterComp extends Comp, MoveHandler {
  id: "character";
  /**
   * Current velocity. Only `vel.y` is meaningful: it includes gravity and can be
   * assigned (`vel.y = 5` launches the character). Horizontal movement comes only
   * from `move()`/`moveTo()`, so `vel.x`/`vel.z` are ignored when written.
   */
  vel: THREE.Vector3;
  jump(force?: number): void;
  isGrounded(): boolean;
  isFalling(): boolean;
  onGround(fn: () => void): EventController;
  teleport(to: Vec3Like): void;
}

/** Options of `raycast()`. */
export interface RaycastOpts {
  /** Ignore these objects. */
  exclude?: GameObj[];
  /** Only hit objects with this tag. */
  tag?: Tag;
  /** Include sensors (default `false`). */
  sensors?: boolean;
}

/**
 * A physics engine adapter. The physics plugin drives it; Rapier is the
 * built-in implementation. Body/collider handles are opaque to the engine.
 * This interface may grow while the plugin matures (it is marked unstable).
 */
export interface PhysicsBackend {
  readonly name: string;
  /** `true` once the engine finished loading and bodies can be created. */
  readonly ready: boolean;
  /** The native world (escape hatch, e.g. a `RAPIER.World`). */
  readonly world: unknown;
  /** The native module (e.g. `RAPIER`). */
  readonly native: unknown;
  init(): Promise<void>;
  setGravity(g: THREE.Vector3): void;
  /** Current gravity vector (a copy). */
  getGravity(): THREE.Vector3;
  /** Advances the simulation by `dt` seconds. */
  step(dt: number): void;
  dispose(): void;
}

/** Options added to `threeplay()` by the physics plugin. */
export interface PhysicsOpts {
  /** `false` disables physics (Rapier is not downloaded). Default `true`. */
  physics?: boolean | { gravity?: number | Vec3Like };
}

/** API of the physics plugin. */
export interface PhysicsAPI {
  /** The physics backend (escape hatch: `physics.world`, `physics.native`). */
  readonly physics: PhysicsBackend;
  area(opts?: AreaOpts): AreaComp;
  body(opts?: BodyOpts): BodyComp;
  character(opts?: CharacterOpts): CharacterComp;
  /** Gravity: a number pulls down (−Y) with that strength (default 20). */
  setGravity(g: number | Vec3Like): void;
  getGravity(): THREE.Vector3;
  /** First object hit by a ray. */
  raycast(origin: Vec3Like, dir: Vec3Like, maxDist?: number, opts?: RaycastOpts): RaycastHit | null;
  /** When an object with `tagA` starts touching one with `tagB`. */
  onCollide(
    tagA: Tag,
    tagB: Tag,
    fn: (a: GameObj, b: GameObj, col: Collision) => void,
  ): EventController;
  onCollideUpdate(
    tagA: Tag,
    tagB: Tag,
    fn: (a: GameObj, b: GameObj, col: Collision) => void,
  ): EventController;
  onCollideEnd(tagA: Tag, tagB: Tag, fn: (a: GameObj, b: GameObj) => void): EventController;
}

declare module "../../core/types" {
  interface PluginRegistry {
    physics: PhysicsAPI;
  }
  interface ThreeplayOpts extends PhysicsOpts {}
}
