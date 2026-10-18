import { Vector3 } from "three";
import type { GameObj } from "./types";

/** A vector or anything with x, y, z. */
export type Vec3Input = Vector3 | { x: number; y: number; z: number };

/**
 * Treats a component's `this` as the game object it was merged into.
 * Component accessors can't declare a `this` type, so plugins use
 * `self(this).object3d` instead.
 */
export const self = (t: unknown) => t as GameObj;

/** Builds a vector from `(x, y, z)`, `(vec)` or `(n)` (uniform when `uniform`). */
export function toVec3(
  x: number | Vec3Input | undefined,
  y?: number,
  z?: number,
  uniform = false,
): Vector3 {
  if (x === undefined) return new Vector3();
  if (typeof x === "object") return new Vector3(x.x, x.y, x.z);
  if (uniform && y === undefined && z === undefined) return new Vector3(x, x, x);
  return new Vector3(x, y ?? 0, z ?? 0);
}

/** `true` if the value is a game object. */
export function isGameObj(v: unknown): v is GameObj {
  return typeof v === "object" && v !== null && "object3d" in v && "tags" in v;
}

/** World position of a vector or game object (a new vector). */
export function targetPos(t: Vec3Input | GameObj): Vector3 {
  if (isGameObj(t)) return t.object3d.getWorldPosition(new Vector3());
  return new Vector3(t.x, t.y, t.z);
}

/** The game object a three.js node belongs to (walking up the graph), if any. */
export function gameObjOf(node: { parent: unknown; userData: Record<string, unknown> } | null) {
  let n = node as { parent: unknown; userData: Record<string, unknown> } | null;
  while (n) {
    if (n.userData.gameObj) return n.userData.gameObj as GameObj;
    n = n.parent as typeof n;
  }
  return null;
}
