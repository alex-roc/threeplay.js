import type { Color } from "three";

/** What decides the layout: the container and the (optional) fixed logical size. */
export interface LayoutInput {
  /** Container CSS size. */
  containerWidth: number;
  containerHeight: number;
  /** Fixed logical size; both or none. */
  width?: number;
  height?: number;
  /** Keep the aspect ratio with bars (default `true`). Only matters with a fixed size. */
  letterbox?: boolean;
}

/** The computed layout. Everything in CSS px except `width`/`height`, which are logical. */
export interface Layout {
  /** Logical size. */
  width: number;
  height: number;
  /** CSS box of the drawn area (canvas and overlay). */
  cssWidth: number;
  cssHeight: number;
  /** Position of that box inside the container (letterbox bars). */
  offsetX: number;
  offsetY: number;
  /** CSS px per logical unit, per axis (equal unless `letterbox: false` stretches). */
  scaleX: number;
  scaleY: number;
}

/**
 * Letterbox math. Without a fixed size the drawn area is the container and
 * logical = CSS. With one, the drawn area is the largest box of that aspect
 * ratio centered in the container (or the whole container when stretching).
 */
export function computeLayout(input: LayoutInput): Layout {
  const cw = Math.max(1, input.containerWidth);
  const ch = Math.max(1, input.containerHeight);
  if (input.width === undefined || input.height === undefined) {
    return {
      width: cw,
      height: ch,
      cssWidth: cw,
      cssHeight: ch,
      offsetX: 0,
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
    };
  }
  const { width, height } = input;
  if (input.letterbox === false) {
    return {
      width,
      height,
      cssWidth: cw,
      cssHeight: ch,
      offsetX: 0,
      offsetY: 0,
      scaleX: cw / width,
      scaleY: ch / height,
    };
  }
  const s = Math.min(cw / width, ch / height);
  const cssWidth = width * s;
  const cssHeight = height * s;
  return {
    width,
    height,
    cssWidth,
    cssHeight,
    offsetX: (cw - cssWidth) / 2,
    offsetY: (ch - cssHeight) / 2,
    scaleX: s,
    scaleY: s,
  };
}

/** `true` if two layouts differ in anything the game can observe (logical size or scale). */
export function layoutChanged(a: Layout | null, b: Layout): boolean {
  return (
    !a ||
    a.width !== b.width ||
    a.height !== b.height ||
    Math.abs(a.scaleX - b.scaleX) > 1e-6 ||
    Math.abs(a.scaleY - b.scaleY) > 1e-6
  );
}

/** CSS color for the letterbox bars: the background darkened (black when transparent). */
export function barColor(background: Color | null, factor = 0.35): string {
  if (!background) return "#000";
  return `#${background.clone().multiplyScalar(factor).getHexString()}`;
}
