import type * as THREE from "three";
import type { GameObj } from "../../core/types.js";
import type { PosTarget, Vec3Like } from "../transform/types.js";

/** The active camera behavior. Starting a new one stops the previous one. */
export interface CameraController {
  /** Which behavior this is. */
  readonly mode: "follow" | "firstPerson" | "thirdPerson" | "orbit" | "topDown";
  /** Stops it; the camera stays where it is. */
  stop(): void;
}

/** Options of `camFollow()`. */
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

/** Options of `firstPerson()`. */
export interface FirstPersonOpts {
  /** Eye height over the object origin (default 0.7). */
  height?: number;
  /** Degrees per pixel of mouse movement (default 0.15). */
  sensitivity?: number;
  /**
   * Lock the pointer on click (default `true`). The mouse only looks around
   * while the pointer is locked; with `false` it always looks around.
   */
  lockOnClick?: boolean;
  /** Pitch limit in degrees (default 85). */
  maxPitch?: number;
}

/** The running first-person behavior. */
export interface FirstPersonController extends CameraController {
  /** Degrees; 0 faces −Z, positive turns left. Also written to the target's `rot.y` if it has `rotate()`. */
  yaw: number;
  /** Degrees; positive looks up. */
  pitch: number;
}

/** Options of `thirdPerson()`. */
export interface ThirdPersonOpts {
  /** Distance behind the target (default 6). */
  distance?: number;
  /** Height of the look-at point over the target origin (default 1). */
  height?: number;
  /** Degrees per pixel of mouse movement (default 0.15). */
  sensitivity?: number;
  /** Pull the camera in when a wall is between it and the target (default `true`, needs physics). The target and the children it has when the ray is first cast are ignored by it. */
  avoidWalls?: boolean;
  /** Lock the pointer on click (default `false`: dragging orbits instead). */
  lockOnClick?: boolean;
  /** Lowest camera elevation in degrees (default −20). */
  minPitch?: number;
  /** Highest camera elevation in degrees (default 60). */
  maxPitch?: number;
}

/** The running third-person behavior. */
export interface ThirdPersonController extends CameraController {
  /** Degrees around the target; 0 puts the camera on its +Z side. */
  yaw: number;
  /** Camera elevation over the horizon, degrees. */
  pitch: number;
  /** Wanted distance (the camera may be closer while a wall is in the way). */
  distance: number;
}

/** Options of `orbitCamera()`. */
export interface OrbitOpts {
  /** Point (or object, tracked every frame) to orbit; default the origin. */
  target?: PosTarget;
  /** Starting distance (default 10). */
  distance?: number;
  /** Drag with the mouse to orbit and scroll to zoom (default `true`). */
  interactive?: boolean;
  /** Auto-rotate in degrees/s (default 0). */
  autoRotate?: number;
  /** Closest zoom (default 2). */
  minDistance?: number;
  /** Farthest zoom (default 50). */
  maxDistance?: number;
}

/** The running orbit behavior. */
export interface OrbitController extends CameraController {
  /** Degrees around the target; 0 puts the camera on its +Z side. */
  yaw: number;
  /** Camera elevation over the horizon, degrees. */
  pitch: number;
  /** Current distance to the target. */
  distance: number;
  /** Point being orbited (refreshed every frame when the option was an object). */
  target: THREE.Vector3;
}

/** Options of `topDown()`. */
export interface TopDownOpts {
  /** Height over the target (default 15). */
  height?: number;
  /** Tilt from vertical in degrees (default 30). */
  angle?: number;
  /** Position smoothing, like {@link FollowOpts.smooth} (default 0.1). */
  smooth?: number;
}

/** API of the camera plugin. Works on `k.camera3d`; resets on scene change. */
export interface CameraAPI {
  /** Gets, or sets, the camera position (always returns a copy). */
  camPos(): THREE.Vector3;
  camPos(x: number | Vec3Like, y?: number, z?: number): THREE.Vector3;
  /** Points the camera at a point or object. A running controller overrides it next frame. */
  camLookAt(target: PosTarget): void;
  /** Gets or sets the vertical field of view in degrees. */
  camFov(deg?: number): number;
  /** Horizontal forward direction of the camera (XZ plane, unit). */
  camForward(): THREE.Vector3;
  /** Horizontal right direction of the camera (XZ plane, unit). */
  camRight(): THREE.Vector3;
  /**
   * Shakes the camera: a random offset decaying to zero over `duration`
   * seconds, applied after the controller and removed on the next frame.
   */
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

declare module "../../core/types.js" {
  interface PluginRegistry {
    camera: CameraAPI;
  }
}
