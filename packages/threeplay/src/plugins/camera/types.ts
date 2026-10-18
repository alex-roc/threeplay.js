import type * as THREE from "three";
import type { GameObj } from "../../core/types";
import type { PosTarget, Vec3Like } from "../transform/types";

/** The active camera behavior. Starting a new one stops the previous one. */
export interface CameraController {
  readonly mode: "follow" | "firstPerson" | "thirdPerson" | "orbit" | "topDown";
  /** Stops it; the camera stays where it is. */
  stop(): void;
}

export interface FollowOpts {
  /** Offset from the target (default `(0, 4, 8)`). */
  offset?: Vec3Like;
  /** 0 = instant, closer to 1 = smoother (default 0.1). Frame-rate independent. */
  smooth?: number;
  /** Look at the target (default `true`). */
  lookAt?: boolean;
  /** Rotate the offset with the target's yaw (`rot.y`) (default `false`). */
  rotateWithTarget?: boolean;
}

export interface FirstPersonOpts {
  /** Eye height over the object origin (default 0.7). */
  height?: number;
  /** Degrees per pixel of mouse movement (default 0.15). */
  sensitivity?: number;
  /** Lock the pointer on click (default `true`). */
  lockOnClick?: boolean;
  /** Pitch limit in degrees (default 85). */
  maxPitch?: number;
}

export interface FirstPersonController extends CameraController {
  /** Degrees. Yaw is also written to the target's `rot.y` if it has `rotate()`. */
  yaw: number;
  pitch: number;
}

export interface ThirdPersonOpts {
  /** Distance behind the target (default 6). */
  distance?: number;
  /** Height of the look-at point over the target origin (default 1). */
  height?: number;
  sensitivity?: number;
  /** Pull the camera in when a wall is between it and the target (default `true`, needs physics). */
  avoidWalls?: boolean;
  lockOnClick?: boolean;
  minPitch?: number;
  maxPitch?: number;
}

export interface ThirdPersonController extends CameraController {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface OrbitOpts {
  target?: PosTarget;
  distance?: number;
  /** Drag with the mouse to orbit and scroll to zoom (default `true`). */
  interactive?: boolean;
  /** Auto-rotate in degrees/s (default 0). */
  autoRotate?: number;
  minDistance?: number;
  maxDistance?: number;
}

export interface OrbitController extends CameraController {
  yaw: number;
  pitch: number;
  distance: number;
  target: THREE.Vector3;
}

export interface TopDownOpts {
  height?: number;
  /** Tilt from vertical in degrees (default 30). */
  angle?: number;
  smooth?: number;
}

/** API of the camera plugin. Works on `k.camera3d`; resets on scene change. */
export interface CameraAPI {
  /** Gets, or sets, the camera position. */
  camPos(): THREE.Vector3;
  camPos(x: number | Vec3Like, y?: number, z?: number): THREE.Vector3;
  /** Points the camera at a point or object. */
  camLookAt(target: PosTarget): void;
  /** Gets or sets the vertical field of view in degrees. */
  camFov(deg?: number): number;
  /** Horizontal forward direction of the camera (XZ plane, unit). */
  camForward(): THREE.Vector3;
  /** Horizontal right direction of the camera (XZ plane, unit). */
  camRight(): THREE.Vector3;
  /** Shakes the camera. */
  camShake(intensity?: number, duration?: number): void;
  /** Chase camera with an offset. */
  camFollow(target: GameObj, opts?: FollowOpts): CameraController;
  /** Mouse-look from the target's eyes. Rotates the target's yaw. */
  firstPerson(target: GameObj, opts?: FirstPersonOpts): FirstPersonController;
  /** Mouse-orbit around the target. */
  thirdPerson(target: GameObj, opts?: ThirdPersonOpts): ThirdPersonController;
  /** Orbit around a point (inspectors, menus, sandboxes). */
  orbitCamera(opts?: OrbitOpts): OrbitController;
  /** Looks down at the target from above. */
  topDown(target: GameObj, opts?: TopDownOpts): CameraController;
  /** The active controller, if any. */
  getCameraController(): CameraController | null;
}

declare module "../../core/types" {
  interface PluginRegistry {
    camera: CameraAPI;
  }
}
