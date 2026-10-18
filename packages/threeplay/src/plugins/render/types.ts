import type * as THREE from "three";
import type { ColorLike, Comp, EventController } from "../../core/types";

/** Which three.js renderer draws the game. */
export type RendererKind = "webgpu" | "webgl" | "none";

/**
 * Wraps a three.js renderer. The engine never talks to three's renderers
 * directly, so a new backend only has to implement this.
 */
export interface RendererBackend {
  readonly kind: RendererKind;
  /** The canvas, or `null` for the headless backend. */
  readonly canvas: HTMLCanvasElement | null;
  /** The underlying three.js renderer (escape hatch), or `null`. */
  readonly three: unknown;
  /** Async setup (WebGPU needs it). Called once by the render plugin. */
  init(): Promise<void>;
  /** Drawing buffer size in CSS pixels plus the pixel ratio. */
  setSize(width: number, height: number, pixelRatio: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

/** What the render plugin hands to a backend factory (`backends/*.ts`). */
export interface BackendOpts {
  /** The canvas to draw into, or `null` for the headless backend. */
  canvas: HTMLCanvasElement | null;
  /** Antialiasing. */
  antialias: boolean;
  /** Enable shadow maps. */
  shadows: boolean;
}

/** Options added to `threeplay()` by the render plugin. */
export interface RenderOpts {
  /**
   * Logical width. With `width` and `height` the game thinks in a fixed size
   * (HUD coordinates, aspect) and the canvas is scaled to the container.
   * Without them the canvas fills the container and the logical size follows it.
   */
  width?: number;
  height?: number;
  /** Keep the aspect ratio with bars when scaling (default `true` with width/height). */
  letterbox?: boolean;
  /** Draw into this canvas instead of creating one. */
  canvas?: HTMLCanvasElement;
  /** Element that receives the canvas and overlays (default `document.body`). */
  root?: HTMLElement;
  /** Clear color (default a soft sky blue). `null` keeps the canvas transparent. */
  background?: ColorLike | null;
  /** `"auto"` (WebGPU with WebGL2 fallback, default), `"webgpu"`, `"webgl"` or `"none"` (headless). */
  renderer?: "auto" | RendererKind;
  /** Device pixel ratio cap (default `Math.min(devicePixelRatio, 2)`). */
  pixelRatio?: number;
  /** Antialiasing (default `true`). */
  antialias?: boolean;
  /** Shadow maps (default `true`). */
  shadows?: boolean;
  /** `"default"` adds a hemisphere light and a sun with shadows; `"none"` adds nothing. */
  lighting?: "default" | "none";
}

/** Linear or exponential fog. */
export type FogOpts =
  | { color?: ColorLike; near: number; far: number }
  | { color?: ColorLike; density: number };

/** Options for light components. */
export interface LightOpts {
  color?: ColorLike;
  intensity?: number;
  /** Cast shadows (default `false`; shadows are expensive). */
  castShadow?: boolean;
}

/** API of the render plugin. */
export interface RenderAPI {
  /** The renderer backend (escape hatch: `renderer.three`). */
  readonly renderer: RendererBackend;
  /** The game canvas (`null` when headless). */
  readonly canvas: HTMLCanvasElement | null;
  /** Logical width (see {@link RenderOpts.width}). */
  width(): number;
  /** Logical height. */
  height(): number;
  /** Logical center `(width/2, height/2)`. */
  center(): THREE.Vector2;
  /** Sets the clear color; `null` for transparent. */
  setBackground(color: ColorLike | null): void;
  getBackground(): THREE.Color | null;
  /** Sets fog, or removes it with `null`. */
  setFog(fog: FogOpts | null): void;
  /** The default lights (`null` with `lighting: "none"`). */
  readonly sun: THREE.DirectionalLight | null;
  readonly ambient: THREE.HemisphereLight | null;
  /**
   * A DOM layer exactly on top of the drawn area, in logical units: a child
   * positioned at `left: x px; top: y px` lands on logical `(x, y)`. Used by
   * the HUD; `null` when headless.
   */
  overlay(): HTMLElement | null;
  /** CSS pixels per logical unit. */
  viewScale(): number;
  /** Projects a world point to logical screen coordinates (`null` if behind the camera). */
  toScreen(world: THREE.Vector3): THREE.Vector2 | null;
  /** Ray from the camera through a logical screen point. */
  screenRay(screen: THREE.Vector2): THREE.Ray;
  /** PNG data URL of the last frame (`""` when headless). */
  screenshot(): string;
  /** Called after the logical size or the scale changes. */
  onResize(fn: () => void): EventController;

  /** Component: a point light attached to the object. */
  pointLight(opts?: LightOpts & { distance?: number; decay?: number }): Comp & {
    id: "pointLight";
    light: THREE.PointLight;
  };
  /** Component: a spot light attached to the object, pointing at `target`. */
  spotLight(opts?: LightOpts & { angle?: number; distance?: number; penumbra?: number }): Comp & {
    id: "spotLight";
    light: THREE.SpotLight;
  };
  /** Component: a directional light placed at the object. */
  dirLight(opts?: LightOpts): Comp & { id: "dirLight"; light: THREE.DirectionalLight };
}

declare module "../../core/types" {
  interface PluginRegistry {
    render: RenderAPI;
  }
  interface ThreeplayOpts extends RenderOpts {}
}
