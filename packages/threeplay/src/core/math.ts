import { Color, SRGBColorSpace, Vector2, Vector3 } from "three";
import type { ColorLike, Tweenable } from "./types.js";

/**
 * A 3D vector (a `THREE.Vector3`). `vec3()` is (0,0,0), `vec3(1)` is (1,1,1),
 * `vec3(v)` copies another vector.
 */
export function vec3(x?: number | { x: number; y: number; z: number }, y?: number, z?: number) {
  if (x === undefined) return new Vector3();
  if (typeof x === "object") return new Vector3(x.x, x.y, x.z);
  if (y === undefined) return new Vector3(x, x, x);
  return new Vector3(x, y, z ?? 0);
}

/** A 2D vector (a `THREE.Vector2`), used for screen and HUD coordinates. */
export function vec2(x?: number | { x: number; y: number }, y?: number) {
  if (x === undefined) return new Vector2();
  if (typeof x === "object") return new Vector2(x.x, x.y);
  return new Vector2(x, y ?? x);
}

/**
 * A color (a `THREE.Color`): `rgb(255, 120, 0)` in 0–255, or anything three.js
 * understands: `rgb("#ff7800")`, `rgb("tomato")`, `rgb(0xff7800)`, `rgb([255, 120, 0])`.
 */
export function rgb(r?: ColorLike | number, g?: number, b?: number) {
  if (r === undefined) return new Color(1, 1, 1);
  if (typeof r === "number" && g !== undefined) {
    return new Color().setRGB(r / 255, g / 255, (b ?? 0) / 255, SRGBColorSpace);
  }
  return toColor(r);
}

/** Normalizes a {@link ColorLike} into a new `THREE.Color`. */
export function toColor(c: ColorLike): Color {
  // 0–255 values are sRGB (like "#rrggbb"), not linear.
  if (Array.isArray(c))
    return new Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, SRGBColorSpace);
  return new Color(c as ConstructorParameters<typeof Color>[0]);
}

/** `rand()` 0–1, `rand(n)` 0–n, `rand(a, b)` a–b. */
export function rand(a?: number, b?: number) {
  if (a === undefined) return Math.random();
  if (b === undefined) return Math.random() * a;
  return a + Math.random() * (b - a);
}

/** Like `rand` but returns an integer; `randi(a, b)` includes `a`, excludes `b`. */
export function randi(a?: number, b?: number) {
  if (a === undefined) return Math.random() < 0.5 ? 0 : 1;
  return Math.floor(rand(a, b));
}

/** A random element of a list. */
export function choose<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** `true` with probability `p` (0–1). */
export function chance(p: number) {
  return Math.random() < p;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

export function deg2rad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function rad2deg(rad: number) {
  return (rad * 180) / Math.PI;
}

/** Maps `v` from the range [l1, h1] to [l2, h2]. */
export function map(v: number, l1: number, h1: number, l2: number, h2: number) {
  return l2 + ((v - l1) / (h1 - l1)) * (h2 - l2);
}

/** Oscillates between `lo` and `hi` as `t` advances (one cycle every 2π). */
export function wave(lo: number, hi: number, t: number) {
  return lo + ((Math.sin(t) + 1) / 2) * (hi - lo);
}

/** An easing function maps progress 0–1 to eased progress. */
export type Easing = (t: number) => number;

const c1 = 1.70158;
const c3 = c1 + 1;
const bounceOut: Easing = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t - 1.5 / d1) ** 2 + 0.75;
  if (t < 2.5 / d1) return n1 * (t - 2.25 / d1) ** 2 + 0.9375;
  return n1 * (t - 2.625 / d1) ** 2 + 0.984375;
};

/** Common easings for `tween()`. */
export const easings = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInBack: (t) => c3 * t * t * t - c1 * t * t,
  easeOutBack: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  easeOutElastic: (t) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1,
  easeOutBounce: bounceOut,
  easeInBounce: (t) => 1 - bounceOut(1 - t),
} satisfies Record<string, Easing>;

/** Interpolates any {@link Tweenable} value (returns a new value for objects). */
export function lerpValue<V extends Tweenable>(a: V, b: V, t: number): V {
  if (typeof a === "number") return lerp(a, b as number, t) as V;
  if (a instanceof Color) return a.clone().lerp(b as Color, t) as V;
  if (a instanceof Vector3) return a.clone().lerp(b as Vector3, t) as V;
  return (a as Vector2).clone().lerp(b as Vector2, t) as V;
}

/** The math helpers exposed on the engine (and on `window` in global mode). */
export const mathAPI = {
  vec3,
  vec2,
  rgb,
  rand,
  randi,
  choose,
  chance,
  lerp,
  clamp,
  deg2rad,
  rad2deg,
  map,
  wave,
  easings,
};
