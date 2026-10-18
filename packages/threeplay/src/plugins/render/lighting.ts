import {
  type Camera,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  type Scene,
  Vector3,
} from "three";
import type { Vec3Like } from "../transform/types.js";

/** Half-size of the sun's shadow box, in world units. */
export const SHADOW_EXTENT = 20;
const SHADOW_MAP_SIZE = 2048;
/** Where the sun sits relative to the point it lights, unless `setDirection()` changes it. */
const SUN_OFFSET = new Vector3(20, 30, 12);
/** Distance from the lit point to the sun (kept when the direction changes, it sizes the shadow range). */
const SUN_DISTANCE = SUN_OFFSET.length();
/** How far ahead of a camera that looks at the horizon the shadow box is centered. */
const LOOK_REACH = SHADOW_EXTENT;

const UP = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const _zero = new Vector3();
const _basis = new Matrix4();
const _inverse = new Matrix4();

/**
 * The point the shadow box is centered on: where the camera's view ray hits
 * the ground plane (`y = 0`), or a point ahead of the camera when it looks
 * at the horizon or up. Written into `out`.
 */
export function sunFocus(camPos: Vector3, camDir: Vector3, out = new Vector3()): Vector3 {
  let t = LOOK_REACH;
  if (camDir.y < -0.05) {
    // Looking down: the ground hit, clamped so a grazing view doesn't send the box far away.
    t = Math.min(Math.max(-camPos.y / camDir.y, 0), LOOK_REACH * 2);
  }
  return out.copy(camPos).addScaledVector(camDir, t);
}

/**
 * Snaps `point` to the shadow map texel grid (in light space) so shadows
 * don't shimmer while the box follows the camera. Written into `out`.
 */
export function snapToTexel(
  point: Vector3,
  lightDir: Vector3,
  texel: number,
  out = new Vector3(),
): Vector3 {
  // Basis of the light: columns map light space to world space.
  _basis.lookAt(_zero, lightDir, Math.abs(lightDir.y) > 0.99 ? Z : UP);
  _inverse.copy(_basis).transpose(); // rotation only: the inverse is the transpose
  out.copy(point).applyMatrix4(_inverse);
  out.x = Math.round(out.x / texel) * texel;
  out.y = Math.round(out.y / texel) * texel;
  return out.applyMatrix4(_basis);
}

/** The default lighting rig installed by `lighting: "default"`. */
export interface DefaultLights {
  sun: DirectionalLight;
  ambient: HemisphereLight;
  /** Moves the shadow box to the action around `camera`. Call once per frame. */
  follow(camera: Camera): void;
  /** Re-aims the sun: `dir` is the direction the light travels (it need not be normalized). */
  setDirection(dir: Vec3Like): void;
  dispose(): void;
}

/** Adds a hemisphere light and a shadow-casting sun directly to the scene (not to the object tree). */
export function createDefaultLights(scene: Scene, shadows: boolean): DefaultLights {
  const ambient = new HemisphereLight(0xcfe8ff, 0x8a7f6a, 1.2);
  ambient.name = "ambient";
  const sun = new DirectionalLight(0xfff2dd, 2.5);
  sun.name = "sun";
  sun.castShadow = shadows;
  const cam = sun.shadow.camera;
  cam.left = -SHADOW_EXTENT;
  cam.right = SHADOW_EXTENT;
  cam.top = SHADOW_EXTENT;
  cam.bottom = -SHADOW_EXTENT;
  cam.near = 1;
  cam.far = 120;
  cam.updateProjectionMatrix();
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.position.copy(SUN_OFFSET);
  scene.add(ambient, sun, sun.target);

  const offset = SUN_OFFSET.clone();
  const lightDir = SUN_OFFSET.clone().normalize().negate();
  const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP_SIZE;
  const focus = new Vector3();
  const camPos = new Vector3();
  const camDir = new Vector3();

  return {
    sun,
    ambient,
    follow(camera) {
      camera.getWorldPosition(camPos);
      camera.getWorldDirection(camDir);
      sunFocus(camPos, camDir, focus);
      snapToTexel(focus, lightDir, texel, focus);
      sun.target.position.copy(focus);
      sun.position.copy(focus).add(offset);
    },
    setDirection(dir) {
      const next = new Vector3(dir.x, dir.y, dir.z);
      if (next.lengthSq() < 1e-12 || !Number.isFinite(next.lengthSq())) {
        throw new Error(
          "setSunDirection() needs a non-zero direction, e.g. { x: -1, y: -2, z: -1 }.",
        );
      }
      lightDir.copy(next).normalize();
      offset.copy(lightDir).multiplyScalar(-SUN_DISTANCE);
      sun.position.copy(sun.target.position).add(offset);
    },
    dispose() {
      sun.shadow.dispose();
      sun.dispose();
      ambient.dispose();
      scene.remove(ambient, sun, sun.target);
    },
  };
}
