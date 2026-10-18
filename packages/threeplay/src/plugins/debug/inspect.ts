import type { Object3D, Ray, Raycaster } from "three";
import type { GameObj } from "../../core/types";
import { gameObjOf } from "../../core/util";

/** Text lines describing an object for the inspector: id, tags and each component's `inspect()`. */
export function describeObject(obj: GameObj): string[] {
  const tags = [...obj.tags];
  const lines = [`#${obj.id}${tags.length ? ` [${tags.join(", ")}]` : ""}`];
  for (const [key, line] of Object.entries(obj.inspect())) lines.push(`  ${key}: ${line}`);
  return lines;
}

/** `true` if the node and all its ancestors are visible. */
export function isVisible(node: Object3D | null) {
  for (let n = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/** Finds the game object under a ray: the nearest visible hit inside `root`. */
export function pickObject(raycaster: Raycaster, ray: Ray, root: Object3D): GameObj | null {
  raycaster.ray.copy(ray);
  for (const hit of raycaster.intersectObject(root, true)) {
    if (!isVisible(hit.object)) continue;
    const obj = gameObjOf(hit.object);
    if (obj?.exists()) return obj;
  }
  return null;
}
