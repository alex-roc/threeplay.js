import { Vector3 } from "three";
import { deg2rad, rad2deg } from "../../core/math.js";

/**
 * Frame-rate independent smoothing factor: the fraction of the remaining
 * distance to cover this frame. `smooth` 0 is instant, closer to 1 is slower;
 * the value is calibrated at 60 fps (`1 − smooth^(dt·60)`).
 */
export function smoothFactor(smooth: number, dt: number): number {
  if (smooth <= 0) return 1;
  if (smooth >= 1) return 0;
  return 1 - smooth ** (dt * 60);
}

/**
 * Point on a sphere around `center`. `yaw` turns around Y (0 = on the +Z side,
 * looking towards −Z), `pitch` is the elevation above the horizon. Degrees.
 */
export function orbitOffset(yaw: number, pitch: number, distance: number): Vector3 {
  const y = deg2rad(yaw);
  const p = deg2rad(pitch);
  return new Vector3(
    Math.sin(y) * Math.cos(p),
    Math.sin(p),
    Math.cos(y) * Math.cos(p),
  ).multiplyScalar(distance);
}

/** Inverse of {@link orbitOffset}: yaw and pitch (degrees) of an offset, `null` if it is ~zero. */
export function offsetAngles(offset: Vector3): { yaw: number; pitch: number } | null {
  const len = offset.length();
  if (len < 1e-3) return null;
  return {
    yaw: rad2deg(Math.atan2(offset.x, offset.z)),
    pitch: rad2deg(Math.asin(Math.max(-1, Math.min(1, offset.y / len)))),
  };
}

/** Yaw in degrees of a direction on the XZ plane (−Z is 0, turning left is positive). */
export function yawOfDirection(dir: { x: number; z: number }): number {
  return rad2deg(Math.atan2(-dir.x, -dir.z));
}

/**
 * Where the camera looks, flattened onto the XZ plane (unit vector). Looking
 * straight up or down falls back to the screen-up axis, so "forward" still
 * means "towards the top of the screen". (The input plugin has the same
 * helper: plugins do not import each other's code.)
 */
export function horizontalForward(camera: {
  getWorldDirection(target: Vector3): Vector3;
  matrixWorld: { elements: ArrayLike<number> };
}): Vector3 {
  const f = camera.getWorldDirection(new Vector3());
  f.y = 0;
  if (f.lengthSq() < 1e-6) {
    const e = camera.matrixWorld.elements;
    f.set(e[4]!, 0, e[6]!);
  }
  if (f.lengthSq() < 1e-6) return new Vector3(0, 0, -1);
  return f.normalize();
}
