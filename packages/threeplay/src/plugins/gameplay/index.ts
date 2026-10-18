import { Box3, type BufferGeometry, Frustum, Matrix4, type Object3D, Sphere, Vector3 } from "three";
import { definePlugin } from "../../core/engine.js";
import { lerp } from "../../core/math.js";
import type { Engine } from "../../core/types.js";
import { self } from "../../core/util.js";
import { createHealth } from "./health.js";
import { createState } from "./state.js";
import { createTimer } from "./timer.js";
import type { GameplayAPI, LifespanComp, OffscreenComp, OffscreenOpts } from "./types.js";

export type * from "./types.js";

const _tmpBox = new Box3();
const _rel = new Matrix4();
const _pos = new Vector3();
const _sphere = new Sphere();

/**
 * Bounding sphere of `mesh` in the local space of `node` (its owner), from the geometry
 * bounds: computed once, then only transformed. `null` while there is no geometry yet.
 */
function localSphere(node: Object3D, mesh: Object3D): Sphere | null {
  node.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(node.matrixWorld).invert();
  const box = new Box3();
  mesh.traverse((m) => {
    const geometry = (m as { geometry?: BufferGeometry }).geometry;
    if (!geometry) return;
    geometry.boundingBox ?? geometry.computeBoundingBox();
    _rel.multiplyMatrices(inverse, m.matrixWorld);
    box.union(_tmpBox.copy(geometry.boundingBox!).applyMatrix4(_rel));
  });
  return box.isEmpty() ? null : box.getBoundingSphere(new Sphere());
}

/** Built-in plugin: `health`, `state`, `lifespan`, `timer` and `offscreen`. */
export const gameplayPlugin = definePlugin<GameplayAPI>({
  name: "gameplay",
  install(k: Engine) {
    // Camera frustum, rebuilt lazily at most once per frame.
    const frustum = new Frustum();
    const _m = new Matrix4();
    let frustumFresh = false;
    k.hooks.on("frameStart", () => {
      frustumFresh = false;
    });
    const cameraFrustum = () => {
      if (!frustumFresh) {
        const cam = k.camera3d;
        cam.updateMatrixWorld();
        frustum.setFromProjectionMatrix(
          _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
        );
        frustumFresh = true;
      }
      return frustum;
    };

    function lifespan(seconds: number, opts: { fade?: number } = {}): LifespanComp {
      const fade = opts.fade ?? 0;
      let elapsed = 0;
      let startOpacity: number | null = null;
      return {
        id: "lifespan",
        update() {
          const obj = self(this);
          elapsed += k.dt();
          const left = seconds - elapsed;
          if (fade > 0 && left < fade && obj.has("opacity")) {
            startOpacity ??= obj.opacity as number;
            obj.opacity = lerp(0, startOpacity, Math.max(0, left) / fade);
          }
          if (left <= 0) obj.destroy();
        },
        inspect() {
          return `${Math.max(0, seconds - elapsed).toFixed(1)}s left`;
        },
      };
    }

    function offscreen(opts: OffscreenOpts = {}): OffscreenComp {
      const distance = opts.distance ?? 100;
      // Starts "on screen": an object created offscreen fires `exitScreen` on its first frame.
      let off = false;
      // Bounds of the object's mesh in its own space; cached, so a frame costs one transform.
      let bounds: Sphere | null = null;

      /** Is this object beyond `distance` from the camera, or (optionally) outside its frustum? */
      const measure = (obj: ReturnType<typeof self>) => {
        const node = obj.object3d;
        const world = node.getWorldPosition(_pos);
        if (world.distanceTo(k.camera3d.position) > distance) return true;
        if (!opts.frustum) return false;
        const f = cameraFrustum();
        const mesh = obj.mesh as Object3D | undefined;
        bounds ??= mesh ? localSphere(node, mesh) : null;
        if (bounds) {
          // `getWorldPosition` above refreshed the node's world matrix.
          return !f.intersectsSphere(_sphere.copy(bounds).applyMatrix4(node.matrixWorld));
        }
        return !f.containsPoint(world);
      };

      return {
        id: "offscreen",
        isOffScreen() {
          return off;
        },
        onExitScreen(fn) {
          return self(this).on("exitScreen", fn);
        },
        onEnterScreen(fn) {
          return self(this).on("enterScreen", fn);
        },
        update() {
          const obj = self(this);
          const now = measure(obj);
          if (now === off) return;
          off = now;
          obj.trigger(off ? "exitScreen" : "enterScreen");
          if (off && opts.destroy) obj.destroy();
        },
        inspect() {
          return off ? "offscreen" : "on screen";
        },
      };
    }

    return {
      health: createHealth,
      state: createState,
      lifespan,
      timer: () => createTimer(k.dt),
      offscreen,
    };
  },
});
