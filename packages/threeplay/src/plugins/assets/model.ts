import {
  type AnimationAction,
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  type Material,
  type Mesh,
} from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { self } from "../../core/util.js";
import type { ModelComp, ModelData, ModelOpts, PlayAnimOpts } from "./types.js";

const _box = new Box3();

/** Lists names for error messages (`"none"` when empty). */
export const listNames = (names: Iterable<string>) => [...names].join(", ") || "none";

/**
 * Builds the `model()` component: one instance (a `SkeletonUtils.clone`, so
 * skinned meshes work) wrapped in a root group that carries the scale, the
 * facing fix and the ground alignment. `dtOf` is `k.dt`.
 */
export function createModel(
  name: string,
  data: ModelData,
  opts: ModelOpts,
  dtOf: () => number,
): ModelComp {
  const scale = opts.scale ?? 1;
  const shadows = opts.shadows ?? true;

  const root = new Group();
  root.name = `model:${name}`;
  const inner = clone(data.scene);
  root.add(inner);
  root.scale.setScalar(scale);
  // glTF faces +Z, the engine's forward is -Z.
  if (opts.faceForward ?? true) root.rotation.y = Math.PI;

  inner.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    if (shadows) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  // The instance shares the template's materials until something needs to change them.
  // The clones are this instance's: they are disposed with it (textures stay shared).
  const cloned = new Set<Material>();
  let isolated = false;
  function isolateMaterials() {
    if (isolated) return;
    isolated = true;
    const copies = new Map<Material, Material>(); // meshes sharing a material keep sharing its copy
    const copy = (m: Material) => {
      let c = copies.get(m);
      if (!c) {
        c = m.clone();
        copies.set(m, c);
        cloned.add(c);
      }
      return c;
    };
    inner.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
    });
  }
  if (opts.uniqueMaterials) isolateMaterials();

  if (opts.groundAlign) {
    root.updateMatrixWorld(true);
    _box.setFromObject(root);
    // The box is in the root's parent space (scaled); `inner` lives inside the scale.
    if (Number.isFinite(_box.min.y) && scale !== 0) inner.position.y -= _box.min.y / scale;
  }

  const clips = data.animations;
  const mixer = clips.length > 0 ? new AnimationMixer(inner) : null;
  let cur: AnimationAction | null = null;

  return {
    id: "shape",
    shape: { kind: "model" },
    mesh: root,
    isolateMaterials,
    anims: clips.map((c) => c.name),
    mixer,
    playAnim(anim: string, play: PlayAnimOpts = {}) {
      const clip = clips.find((c) => c.name === anim);
      if (!mixer || !clip) {
        throw new Error(
          `Model "${name}" has no animation "${anim}". Available animations: ${listNames(clips.map((c) => c.name))}.`,
        );
      }
      const loop = play.loop ?? true;
      const speed = play.speed ?? 1;
      const fade = play.fade ?? 0.2;
      const action = mixer.clipAction(clip);
      // Re-requesting the running animation (e.g. every frame) must not restart it.
      if (cur === action && action.isRunning()) {
        action.timeScale = speed;
        return;
      }
      const prev = cur;
      action.reset();
      action.setEffectiveWeight(1);
      action.timeScale = speed;
      action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Number.POSITIVE_INFINITY : 1);
      action.clampWhenFinished = !loop;
      if (prev && prev !== action) {
        if (fade > 0 && prev.isRunning()) action.crossFadeFrom(prev, fade, false);
        else prev.stop();
      }
      action.play();
      cur = action;
    },
    stopAnim() {
      mixer?.stopAllAction();
      cur = null;
    },
    curAnim() {
      return cur ? cur.getClip().name : null;
    },
    onAnimEnd(fn) {
      return self(this).on("animEnd", fn);
    },
    add() {
      const obj = self(this);
      obj.object3d.add(root);
      mixer?.addEventListener("finished", (e) => {
        obj.trigger("animEnd", (e as unknown as { action: AnimationAction }).action.getClip().name);
      });
      if (opts.anim) obj.playAnim(opts.anim, { fade: 0 });
    },
    update() {
      mixer?.update(dtOf());
    },
    destroy() {
      mixer?.stopAllAction();
      mixer?.uncacheRoot(inner);
      root.removeFromParent();
      for (const m of cloned) m.dispose();
      cloned.clear();
    },
    inspect() {
      return cur ? `${name} (${cur.getClip().name})` : name;
    },
  };
}
