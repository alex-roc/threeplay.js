import { Euler, Quaternion, Vector3 } from "three";
import { definePlugin } from "../../core/engine";
import { clamp, deg2rad } from "../../core/math";
import type { Engine, GameObj } from "../../core/types";
import { isGameObj, targetPos, toVec3 } from "../../core/util";
import { horizontalForward, offsetAngles, orbitOffset, smoothFactor, yawOfDirection } from "./math";
import type {
  CameraAPI,
  CameraController,
  FirstPersonController,
  FirstPersonOpts,
  FollowOpts,
  OrbitController,
  OrbitOpts,
  ThirdPersonController,
  ThirdPersonOpts,
  TopDownOpts,
} from "./types";

export type * from "./types";

const UP = new Vector3(0, 1, 0);
/** Degrees of orbit per pixel dragged with `orbitCamera`. */
const ORBIT_SENSITIVITY = 0.4;
/** Wheel zoom: distance is multiplied by `exp(deltaY * ZOOM_SPEED)`. */
const ZOOM_SPEED = 0.001;
/** Gap (meters) kept between a wall and the third-person camera. */
const WALL_MARGIN = 0.3;

/** A running behavior: its public controller plus what to do each frame. */
interface Active {
  controller: CameraController;
  update(dt: number): void;
  dispose(): void;
}

/** Built-in plugin: camera behaviors (follow, first/third person, orbit, top-down) and shake. */
export const cameraPlugin = definePlugin<CameraAPI>({
  name: "camera",
  dependencies: ["render", "transform", "input"],
  install(k: Engine) {
    let active: Active | null = null;
    let shake: { intensity: number; duration: number; elapsed: number } | null = null;
    /** Shake offset currently added to the camera position (removed next frame). */
    const shakeOffset = new Vector3();

    const cam = () => k.camera3d;

    function removeShake() {
      cam().position.sub(shakeOffset);
      shakeOffset.set(0, 0, 0);
    }

    function stopActive() {
      const prev = active;
      active = null;
      prev?.dispose();
    }

    /** Starts a behavior (stopping the previous one) and returns its controller. */
    function activate<C extends Omit<CameraController, "stop">>(
      fields: C,
      update: (c: C & CameraController, dt: number) => void,
      dispose: () => void = () => {},
    ): C & CameraController {
      stopActive();
      const controller: C & CameraController = {
        ...fields,
        stop() {
          if (active?.controller === controller) stopActive();
        },
      };
      active = { controller, update: (dt) => update(controller, dt), dispose };
      return controller;
    }

    function resetCamera() {
      shake = null;
      shakeOffset.set(0, 0, 0);
      const c = cam();
      c.position.set(0, 5, 10);
      c.lookAt(0, 0, 0);
      c.fov = 60;
      c.updateProjectionMatrix();
    }

    // Behaviors run after physics (install order), so characters already moved.
    k.hooks.on("afterUpdate", (dt) => {
      removeShake();
      active?.update(dt);
      if (shake) {
        shake.elapsed += dt;
        if (shake.elapsed >= shake.duration) {
          shake = null;
        } else {
          const amp = shake.intensity * (1 - shake.elapsed / shake.duration);
          shakeOffset.set(k.rand(-amp, amp), k.rand(-amp, amp), k.rand(-amp, amp));
          cam().position.add(shakeOffset);
        }
      }
    });
    k.hooks.on("sceneEnter", () => {
      stopActive();
      resetCamera();
    });
    k.onQuit(stopActive);

    /** Locks the pointer on a click on the canvas, inside the user gesture. */
    function lockOnCanvasClick(): () => void {
      const canvas = k.canvas ?? null;
      if (!canvas) return () => {};
      const onDown = () => {
        if (!k.isPointerLocked()) k.lockPointer();
      };
      canvas.addEventListener("mousedown", onDown);
      return () => canvas.removeEventListener("mousedown", onDown);
    }

    /** Heading (degrees) the camera currently looks towards. */
    const cameraYaw = () => yawOfDirection(horizontalForward(cam()));

    /** Yaw (degrees) of a game object, from its world −Z axis. */
    const objectYaw = (obj: GameObj) =>
      yawOfDirection(
        new Vector3(0, 0, -1).applyQuaternion(obj.object3d.getWorldQuaternion(new Quaternion())),
      );

    return {
      camPos(x?: number | { x: number; y: number; z: number }, y?: number, z?: number) {
        if (x !== undefined) {
          shakeOffset.set(0, 0, 0);
          cam().position.copy(toVec3(x, y, z));
        }
        return cam().position.clone().sub(shakeOffset);
      },
      camLookAt(target) {
        cam().lookAt(targetPos(target));
      },
      camFov(deg) {
        const c = cam();
        if (deg !== undefined) {
          c.fov = deg;
          c.updateProjectionMatrix();
        }
        return c.fov;
      },
      camForward: () => horizontalForward(cam()),
      camRight: () => new Vector3().crossVectors(horizontalForward(cam()), UP),
      camShake(intensity = 0.3, duration = 0.4) {
        shake = { intensity, duration, elapsed: 0 };
      },

      camFollow(target: GameObj, opts: FollowOpts = {}) {
        const offset = toVec3(opts.offset ?? { x: 0, y: 4, z: 8 });
        const smooth = opts.smooth ?? 0.1;
        const lookAt = opts.lookAt ?? true;
        const rotateWithTarget = opts.rotateWithTarget ?? false;
        return activate({ mode: "follow" as const }, (_c, dt) => {
          if (!target.exists()) return;
          const here = targetPos(target);
          const off = offset.clone();
          if (rotateWithTarget) off.applyAxisAngle(UP, deg2rad(objectYaw(target)));
          cam().position.lerp(here.add(off), smoothFactor(smooth, dt));
          if (lookAt) cam().lookAt(targetPos(target));
        });
      },

      firstPerson(target: GameObj, opts: FirstPersonOpts = {}) {
        const height = opts.height ?? 0.7;
        const sensitivity = opts.sensitivity ?? 0.15;
        const lockOnClick = opts.lockOnClick ?? true;
        const maxPitch = opts.maxPitch ?? 85;
        const unlock = lockOnClick ? lockOnCanvasClick() : () => {};
        const fields = {
          mode: "firstPerson" as const,
          yaw: target.has("rotate") ? objectYaw(target) : cameraYaw(),
          pitch: 0,
        };
        return activate<FirstPersonController>(
          fields as FirstPersonController,
          (c) => {
            if (k.isPointerLocked() || !lockOnClick) {
              const d = k.mouseDeltaPos();
              c.yaw -= d.x * sensitivity;
              c.pitch -= d.y * sensitivity;
            }
            c.pitch = clamp(c.pitch, -maxPitch, maxPitch);
            if (!target.exists()) return;
            cam().position.copy(targetPos(target)).y += height;
            cam().quaternion.setFromEuler(new Euler(deg2rad(c.pitch), deg2rad(c.yaw), 0, "YXZ"));
            if (target.has("rotate")) target.rot.y = c.yaw;
          },
          unlock,
        );
      },

      thirdPerson(target: GameObj, opts: ThirdPersonOpts = {}) {
        const height = opts.height ?? 1;
        const sensitivity = opts.sensitivity ?? 0.15;
        const avoidWalls = opts.avoidWalls ?? true;
        const lockOnClick = opts.lockOnClick ?? false;
        const minPitch = opts.minPitch ?? -20;
        const maxPitch = opts.maxPitch ?? 60;
        const unlock = lockOnClick ? lockOnCanvasClick() : () => {};
        const wanted = opts.distance ?? 6;
        let shown = wanted; // distance after pulling in for walls
        const fields = {
          mode: "thirdPerson" as const,
          yaw: target.has("rotate") ? objectYaw(target) : cameraYaw(),
          pitch: clamp(15, minPitch, maxPitch),
          distance: wanted,
        };
        return activate<ThirdPersonController>(
          fields as ThirdPersonController,
          (c, dt) => {
            if (k.isPointerLocked() || k.isMouseDown("left") || k.isMouseDown("right")) {
              const d = k.mouseDeltaPos();
              c.yaw -= d.x * sensitivity;
              c.pitch += d.y * sensitivity;
            }
            c.pitch = clamp(c.pitch, minPitch, maxPitch);
            if (!target.exists()) return;
            const look = targetPos(target).add(new Vector3(0, height, 0));
            const dir = orbitOffset(c.yaw, c.pitch, 1);
            let allowed = c.distance;
            if (avoidWalls && k.plugins.physics && typeof k.raycast === "function") {
              const hit = k.raycast(look, dir, c.distance, {
                exclude: [target, ...target.get("*")],
              });
              if (hit) allowed = Math.max(Math.min(hit.distance - WALL_MARGIN, c.distance), 0.5);
            }
            // Pull in at once, ease back out.
            shown = allowed < shown ? allowed : shown + (allowed - shown) * smoothFactor(0.9, dt);
            cam().position.copy(look).addScaledVector(dir, shown);
            cam().lookAt(look);
          },
          unlock,
        );
      },

      orbitCamera(opts: OrbitOpts = {}) {
        const interactive = opts.interactive ?? true;
        const autoRotate = opts.autoRotate ?? 0;
        const minDistance = opts.minDistance ?? 2;
        const maxDistance = opts.maxDistance ?? 50;
        const followed = isGameObj(opts.target) ? opts.target : null;
        const center = targetPos(opts.target ?? { x: 0, y: 0, z: 0 });
        const distance = clamp(opts.distance ?? 10, minDistance, maxDistance);
        // Start from where the camera already is, so the view does not jump.
        const start = offsetAngles(cam().position.clone().sub(center)) ?? { yaw: 0, pitch: 30 };
        const fields = {
          mode: "orbit" as const,
          yaw: start.yaw,
          pitch: clamp(start.pitch, -85, 85),
          distance,
          target: center,
        };
        const scroll = interactive
          ? k.onScroll((d) => {
              const c = active?.controller as OrbitController | undefined;
              if (c?.mode === "orbit") c.distance *= Math.exp(d.y * ZOOM_SPEED);
            })
          : null;
        return activate<OrbitController>(
          fields as OrbitController,
          (c, dt) => {
            if (followed?.exists()) c.target.copy(targetPos(followed));
            const dragging = interactive && (k.isMouseDown("left") || k.isMouseDown("right"));
            if (dragging) {
              const d = k.mouseDeltaPos();
              c.yaw -= d.x * ORBIT_SENSITIVITY;
              c.pitch += d.y * ORBIT_SENSITIVITY;
            } else {
              c.yaw += autoRotate * dt;
            }
            c.pitch = clamp(c.pitch, -85, 85);
            c.distance = clamp(c.distance, minDistance, maxDistance);
            cam()
              .position.copy(c.target)
              .add(orbitOffset(c.yaw, c.pitch, c.distance));
            cam().lookAt(c.target);
          },
          () => scroll?.cancel(),
        );
      },

      topDown(target: GameObj, opts: TopDownOpts = {}) {
        const height = opts.height ?? 15;
        const angle = opts.angle ?? 30;
        const smooth = opts.smooth ?? 0.1;
        // Fixed look direction (tilted `angle` from straight down, towards −Z).
        const tilt = new Euler(deg2rad(-(90 - angle)), 0, 0, "YXZ");
        const offset = new Vector3(0, height, height * Math.tan(deg2rad(angle)));
        return activate({ mode: "topDown" as const }, (_c, dt) => {
          if (!target.exists()) return;
          cam().position.lerp(targetPos(target).add(offset), smoothFactor(smooth, dt));
          cam().quaternion.setFromEuler(tilt);
        });
      },

      getCameraController: () => active?.controller ?? null,
    };
  },
});
