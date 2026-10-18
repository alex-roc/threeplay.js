import type * as THREE from "three";
import type { EventController } from "../../core/types.js";
import type { ShapeComp } from "../shapes/types.js";

/** A loaded (or procedurally defined) model, ready to be instanced with `model()`. */
export interface ModelData {
  /** The template scene. Instances are clones of it; never add it to the scene directly. */
  scene: THREE.Object3D;
  /** Animation clips of the model. */
  animations: THREE.AnimationClip[];
}

/** Options of `model()`. */
export interface ModelOpts {
  /** Uniform scale applied to the model's root (default 1). */
  scale?: number;
  /** Cast and receive shadows on every mesh (default `true`). */
  shadows?: boolean;
  /** Move the model so its bounding box bottom sits at y=0 (default `false`). */
  groundAlign?: boolean;
  /** Animation to start right away (looping). */
  anim?: string;
  /**
   * glTF assets face +Z while the engine's forward is −Z. With `true` (the
   * default) the model root is turned 180° around Y so the model faces the
   * object's `forward()`. Use `false` for models already authored facing −Z.
   */
  faceForward?: boolean;
  /**
   * Clone the materials for this instance up front (default `false`: instances share
   * the template's materials, which is cheaper). Not needed to tint or fade one instance:
   * `color()` and `opacity()` on a model clone its materials automatically. The clones are
   * disposed when the object is destroyed.
   */
  uniqueMaterials?: boolean;
}

/** Options of `playAnim()`. */
export interface PlayAnimOpts {
  /** Repeat forever (default `true`). A non-looping animation holds its last pose and fires `animEnd`. */
  loop?: boolean;
  /** Playback speed multiplier (default 1). */
  speed?: number;
  /** Cross-fade seconds from the current animation (default 0.2). */
  fade?: number;
}

/**
 * Fields added by `model()`. Also satisfies the shape contract
 * (`shape.kind === "model"`, `mesh` is the instanced scene root, a child of
 * `object3d`). Each instance owns an `AnimationMixer`, ticked with `k.dt()`.
 * The object emits an `"animEnd"` event (with the animation name) when a
 * non-looping animation finishes.
 */
export interface ModelComp extends ShapeComp {
  id: "shape";
  /** Names of the model's animations. */
  anims: string[];
  /**
   * Plays an animation by name, cross-fading from the current one. Calling it
   * again for the animation that is already playing only updates its speed.
   * Throws (listing the available names) if the model has no such animation.
   */
  playAnim(name: string, opts?: PlayAnimOpts): void;
  /** Stops every animation (the model goes back to its bind pose). */
  stopAnim(): void;
  /** Name of the playing animation, if any. */
  curAnim(): string | null;
  /** Runs when a non-looping animation finishes. */
  onAnimEnd(fn: (name: string) => void): EventController;
  /** Escape hatch: the instance's mixer (`null` if the model has no animations). */
  mixer: THREE.AnimationMixer | null;
}

/** API of the assets plugin. Every `load*` call delays the first scene until done. */
export interface AssetsAPI {
  /**
   * Sets the prefix for relative asset URLs (`loadRoot("assets/")`) and
   * returns the current one. Absolute URLs (`http:`, `/`, `data:`, `blob:`)
   * are never prefixed.
   */
  loadRoot(path?: string): string;
  /** Loads a glTF/GLB model under a name. */
  loadModel(name: string, url: string): Promise<ModelData>;
  /** Loads a texture under a name (sRGB, repeat wrapping). */
  loadTexture(name: string, url: string): Promise<THREE.Texture>;
  /**
   * Registers a procedurally built or already parsed model under a name, so
   * `model(name)` can instance it. Useful without network (tests) or with a
   * custom loader.
   */
  defineModel(name: string, scene: THREE.Object3D, animations?: THREE.AnimationClip[]): ModelData;
  /** A loaded model, if any. */
  getModel(name: string): ModelData | undefined;
  /** A loaded texture, if any. */
  getTexture(name: string): THREE.Texture | undefined;
  /** Component: an instance of a loaded model. Throws if the name is not loaded. */
  model(name: string, opts?: ModelOpts): ModelComp;
}

declare module "../../core/types.js" {
  interface PluginRegistry {
    assets: AssetsAPI;
  }
}
