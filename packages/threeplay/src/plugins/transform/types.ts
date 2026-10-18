import type * as THREE from "three";
import type { GameObj } from "../../core/types";

/** Something that has a position: a vector or a game object with `pos`. */
export type Vec3Like = THREE.Vector3 | { x: number; y: number; z: number };
export type PosTarget = Vec3Like | GameObj;

/** Fields added by `pos()`. */
export interface PosComp {
  id: "pos";
  /** Local position (it *is* `object3d.position`). */
  pos: THREE.Vector3;
  /**
   * Moves by a velocity in units per second (multiplied by `dt()` for you).
   * If the object has a component defining `applyMove` (physics), the
   * movement is handed to it so it respects collisions.
   */
  move(x: number | Vec3Like, y?: number, z?: number): void;
  /** Moves towards a point at `speed` units/s, or jumps there without `speed`. */
  moveTo(target: PosTarget, speed?: number): void;
  /** Position in world space (accounts for parents). */
  worldPos(): THREE.Vector3;
  /** Sets the world-space position. */
  setWorldPos(v: Vec3Like): void;
  /** Distance to a point or object. */
  distanceTo(target: PosTarget): number;
}

/**
 * Contract for movement-controlling components (character, body): a
 * component that defines `applyMove` receives every `move()` call instead
 * of `pos` changing directly.
 */
export interface MoveHandler {
  /** `delta` is the displacement for this frame, `velocity` the requested units/s. */
  applyMove(delta: THREE.Vector3, velocity: THREE.Vector3): void;
}

/** Fields added by `rotate()`. Angles are in degrees. */
export interface RotateComp {
  id: "rotate";
  /** Euler rotation in degrees (X, Y, Z), applied to `object3d` every frame. */
  rot: THREE.Vector3;
  /** Adds degrees to the rotation. */
  rotateBy(x: number, y?: number, z?: number): void;
  /** Turns the object to face a point or object (Y-up). */
  lookAt(target: PosTarget): void;
  /** Unit vector the object faces (local -Z in world space). */
  forward(): THREE.Vector3;
  /** Unit vector to the object's right (local +X in world space). */
  right(): THREE.Vector3;
}

/** Fields added by `scale()`. */
export interface ScaleComp {
  id: "scale";
  /** Local scale (it *is* `object3d.scale`). */
  scale: THREE.Vector3;
  scaleTo(x: number, y?: number, z?: number): void;
}

/** Fields added by `follow()`. */
export interface FollowComp {
  id: "follow";
  follow: { target: GameObj | null; offset: THREE.Vector3 };
}

/** API of the transform plugin. */
export interface TransformAPI {
  /** Component: position. `pos(x, y, z)` or `pos(vec)`. */
  pos(x?: number | Vec3Like, y?: number, z?: number): PosComp;
  /** Component: rotation in degrees. `rotate(y)` rotates around Y only. */
  rotate(x?: number, y?: number, z?: number): RotateComp;
  /** Component: scale. `scale(2)` is uniform. */
  scale(x?: number | Vec3Like, y?: number, z?: number): ScaleComp;
  /** Component: keeps the object at `target.worldPos() + offset` every frame. */
  follow(target: GameObj | null, offset?: Vec3Like): FollowComp;
}

declare module "../../core/types" {
  interface PluginRegistry {
    transform: TransformAPI;
  }
}
