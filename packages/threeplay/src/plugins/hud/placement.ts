import type { Color } from "three";
import type { Anchor } from "./types";

/** Fraction of the element's size that `pos` is offset by, per anchor: `[x, y]`. */
export const ANCHORS: Record<Anchor, readonly [number, number]> = {
  topleft: [0, 0],
  top: [0.5, 0],
  topright: [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  botleft: [0, 1],
  bot: [0.5, 1],
  botright: [1, 1],
};

/** `true` if `a` is a valid {@link Anchor}. */
export function isAnchor(a: unknown): a is Anchor {
  return typeof a === "string" && Object.hasOwn(ANCHORS, a);
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * CSS `transform` that puts the anchor point of an element (whose own origin
 * is its top-left corner) at `(x, y)`.
 */
export function hudTransform(x: number, y: number, anchor: Anchor): string {
  const [fx, fy] = ANCHORS[anchor];
  const t = `translate(${round(x)}px, ${round(y)}px)`;
  return fx === 0 && fy === 0 ? t : `${t} translate(${-fx * 100}%, ${-fy * 100}%)`;
}

/** CSS hex color of a `THREE.Color` (sRGB, as the player sees it on the 3D side). */
export function cssColor(c: Color): string {
  return `#${c.getHexString()}`;
}

/** The part of an element the HUD touches; real DOM elements satisfy it. */
export interface StyledElement {
  style: Partial<Record<"transform" | "display" | "opacity" | "color" | "backgroundColor", string>>;
}

/** What an element should look like this frame. */
export interface HudFrame {
  visible: boolean;
  x: number;
  y: number;
  anchor: Anchor;
  /** 0–1, or `undefined` to leave it alone. */
  opacity?: number;
  /** `undefined` leaves the element's own color. */
  color?: Color;
  /** CSS property the color goes to (text color, or the fill of a rect). */
  colorProp: "color" | "backgroundColor";
}

/** Last values written to an element, to skip redundant style writes. */
export interface HudState {
  transform?: string;
  display?: string;
  opacity?: string;
  color?: string;
}

/** Writes `frame` to `el`, touching only the styles that changed since `state`. */
export function applyFrame(el: StyledElement, state: HudState, frame: HudFrame): void {
  const display = frame.visible ? "" : "none";
  if (state.display !== display) el.style.display = state.display = display;
  if (!frame.visible) return;

  const transform = hudTransform(frame.x, frame.y, frame.anchor);
  if (state.transform !== transform) el.style.transform = state.transform = transform;

  if (frame.opacity !== undefined) {
    const opacity = String(Math.min(1, Math.max(0, frame.opacity)));
    if (state.opacity !== opacity) el.style.opacity = state.opacity = opacity;
  }
  if (frame.color) {
    const color = cssColor(frame.color);
    if (state.color !== color) el.style[frame.colorProp] = state.color = color;
  }
}
