import { Vector3 } from "three";

const UP = new Vector3(0, 1, 0);

/**
 * Where the camera looks, flattened onto the XZ plane (unit vector). When it
 * looks straight up or down the screen-up axis is used instead, so
 * "forward" still means "towards the top of the screen".
 */
export function horizontalForward(camera: {
  getWorldDirection(target: Vector3): Vector3;
  matrixWorld: { elements: ArrayLike<number> };
}): Vector3 {
  const f = camera.getWorldDirection(new Vector3());
  f.y = 0;
  if (f.lengthSq() < 1e-6) {
    // Camera up axis is the 2nd column of its world matrix.
    const e = camera.matrixWorld.elements;
    f.set(e[4]!, 0, e[6]!);
  }
  if (f.lengthSq() < 1e-6) return new Vector3(0, 0, -1);
  return f.normalize();
}

/**
 * Combines a 2D input (`x` right, `forward` ahead, each −1…1) with a facing
 * direction on the XZ plane into a world vector: unit length, or zero.
 */
export function inputToWorld(x: number, forward: number, facing: Vector3): Vector3 {
  // right = forward × up
  const right = new Vector3().crossVectors(facing, UP);
  const out = right.multiplyScalar(x).addScaledVector(facing, forward);
  out.y = 0;
  return out.lengthSq() < 1e-12 ? out.set(0, 0, 0) : out.normalize();
}
