import type * as THREE from "three";
import type { Comp } from "../../core/types";

/** Where a HUD element's `pos` sits on the element. */
export type Anchor =
  | "topleft"
  | "top"
  | "topright"
  | "left"
  | "center"
  | "right"
  | "botleft"
  | "bot"
  | "botright";

export interface TextOpts {
  /** Font size in logical pixels (default 16). */
  size?: number;
  /** CSS font family (default `system-ui, sans-serif`). */
  font?: string;
  /** Wrap width in logical pixels. */
  width?: number;
  align?: "left" | "center" | "right";
  /** Bold, or a CSS font weight. */
  weight?: number | "normal" | "bold";
  /** Dark outline for readability over the 3D scene (default `true`). */
  outline?: boolean;
}

/**
 * Fields added by `text()`. Rendered as a DOM element on the render
 * overlay, so any font and character works. With `fixed()` the object's
 * `pos.x/pos.y` are logical screen pixels from the top-left; without it the
 * label floats over the object's world position.
 */
export interface TextComp extends Comp {
  id: "text";
  text: string;
  textSize: number;
  /** The DOM element (escape hatch: style it at will). */
  el: HTMLElement | null;
}

export interface RectOpts {
  radius?: number;
  /** Outline color (CSS). */
  outline?: string;
}

/** Fields added by `uiRect()`: a HUD rectangle (bars, panels). */
export interface UIRectComp extends Comp {
  id: "uiRect";
  width: number;
  height: number;
  el: HTMLElement | null;
}

/** API of the HUD plugin. */
export interface HudAPI {
  text(str?: string | number, opts?: TextOpts): TextComp;
  uiRect(width: number, height: number, opts?: RectOpts): UIRectComp;
  /** Component: the object lives in screen space (HUD) instead of the 3D world. */
  fixed(): Comp & { id: "fixed" };
  /** Component: which point of a HUD element `pos` refers to (default `"topleft"`). */
  anchor(a: Anchor): Comp & { id: "anchor"; anchor: Anchor };
  /** Projects a world position to logical screen coordinates (same as `toScreen`). */
  worldToHud(world: THREE.Vector3): THREE.Vector2 | null;
}

declare module "../../core/types" {
  interface PluginRegistry {
    hud: HudAPI;
  }
}
