import type * as THREE from "three";
import type { EventController } from "../../core/types";
import type { ShapeComp } from "../shapes/types";

/** A loaded glTF model, ready to be instanced with `model()`. */
export interface ModelData {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export interface ModelOpts {
  /** Uniform scale applied to the model's root (default 1). */
  scale?: number;
  /** Cast and receive shadows on every mesh (default `true`). */
  shadows?: boolean;
  /** Move the model so its bounding box bottom sits at y=0 (default `false`). */
  groundAlign?: boolean;
  /** Animation to start right away (looping). */
  anim?: string;
}

export interface PlayAnimOpts {
  loop?: boolean;
  speed?: number;
  /** Cross-fade seconds from the current animation (default 0.2). */
  fade?: number;
}

/**
 * Fields added by `model()`. Also satisfies the shape contract
 * (`shape.kind === "model"`, `mesh` is the instanced scene).
 */
export interface ModelComp extends ShapeComp {
  id: "shape";
  /** Names of the model's animations. */
  anims: string[];
  playAnim(name: string, opts?: PlayAnimOpts): void;
  stopAnim(): void;
  /** Name of the playing animation, if any. */
  curAnim(): string | null;
  onAnimEnd(fn: (name: string) => void): EventController;
  /** Escape hatch. */
  mixer: THREE.AnimationMixer | null;
}

/** API of the assets plugin. Every `load*` call delays the first scene until done. */
export interface AssetsAPI {
  /** Prefix for relative asset URLs. */
  loadRoot(path?: string): string;
  /** Loads a glTF/GLB model under a name. */
  loadModel(name: string, url: string): Promise<ModelData>;
  /** Loads a texture under a name (sRGB, repeat wrapping). */
  loadTexture(name: string, url: string): Promise<THREE.Texture>;
  getModel(name: string): ModelData | undefined;
  getTexture(name: string): THREE.Texture | undefined;
  /** Component: an instance of a loaded model. */
  model(name: string, opts?: ModelOpts): ModelComp;
}

declare module "../../core/types" {
  interface PluginRegistry {
    assets: AssetsAPI;
  }
}
