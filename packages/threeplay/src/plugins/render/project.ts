import { type Camera, type Ray, Raycaster, Vector2, Vector3 } from "three";

const _p = new Vector3();
const _raycaster = new Raycaster();

/**
 * Projects a world point to logical screen coordinates (origin top-left,
 * `width` x `height`). `null` when the point is behind the camera.
 */
export function projectToScreen(
  world: Vector3,
  camera: Camera,
  width: number,
  height: number,
): Vector2 | null {
  camera.updateWorldMatrix(true, false);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  // Cameras look down -Z: anything with z >= 0 in view space is behind (or on) the lens.
  _p.copy(world).applyMatrix4(camera.matrixWorldInverse);
  if (_p.z >= 0) return null;
  _p.applyMatrix4(camera.projectionMatrix); // includes the perspective divide
  return new Vector2(((_p.x + 1) / 2) * width, ((1 - _p.y) / 2) * height);
}

/** Ray from the camera through a logical screen point. */
export function screenToRay(screen: Vector2, camera: Camera, width: number, height: number): Ray {
  camera.updateWorldMatrix(true, false);
  _raycaster.setFromCamera(
    new Vector2((screen.x / width) * 2 - 1, -(screen.y / height) * 2 + 1),
    camera,
  );
  return _raycaster.ray.clone();
}
