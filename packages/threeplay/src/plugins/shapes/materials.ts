import {
  type Color,
  type Material,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  type Object3D,
  RepeatWrapping,
  type Texture,
} from "three";
import { toColor } from "../../core/math";
import type { MaterialOpts } from "./types";

/** Default material of the primitives. */
export function defaultMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 });
}

/**
 * Builds a material from {@link MaterialOpts}. A `map` given as a string is
 * not resolved here (the texture may not be loaded yet): the caller does it.
 */
export function createMaterial(opts: MaterialOpts): Material {
  const params: Record<string, unknown> = {
    color: opts.map ? 0xffffff : 0xdddddd,
    wireframe: opts.wireframe,
    flatShading: opts.flatShading,
  };
  if (opts.emissive !== undefined) params.emissive = toColor(opts.emissive);
  if (opts.emissiveIntensity !== undefined) params.emissiveIntensity = opts.emissiveIntensity;
  switch (opts.type ?? "standard") {
    case "basic":
      return new MeshBasicMaterial({ color: params.color as number, wireframe: opts.wireframe });
    case "toon":
      return new MeshToonMaterial(params);
    case "lambert":
      return new MeshLambertMaterial(params);
    case "phong":
      return new MeshPhongMaterial(params);
    default:
      return new MeshStandardMaterial({
        ...params,
        roughness: opts.roughness ?? 0.8,
        metalness: opts.metalness ?? 0,
      });
  }
}

/** Texture repeat as `[x, y]`, or `null` when it is the default (1). */
export function repeatOf(repeat: MaterialOpts["repeat"]): [number, number] | null {
  if (repeat === undefined) return null;
  const [x, y] = typeof repeat === "number" ? [repeat, repeat] : repeat;
  return x === 1 && y === 1 ? null : [x, y];
}

/** A copy of `texture` that repeats `repeat` times (the original is left alone). */
export function repeatedTexture(texture: Texture, repeat: [number, number]): Texture {
  const t = texture.clone();
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

/** Every material under `root` (a mesh, or a whole model), without duplicates. */
export function collectMaterials(root: Object3D | undefined | null): Material[] {
  const out = new Set<Material>();
  root?.traverse((node) => {
    const m = (node as { material?: Material | Material[] }).material;
    if (Array.isArray(m)) for (const x of m) out.add(x);
    else if (m) out.add(m);
  });
  return [...out];
}

/** Makes every material under `root` use `color` (the same instance, so edits show up live). */
export function shareColor(root: Object3D | undefined | null, color: Color): void {
  for (const m of collectMaterials(root)) {
    if ("color" in m) (m as Material & { color: Color }).color = color;
  }
}

/** Materials whose `transparent` flag was set by the user, so opacity 1 doesn't clear it. */
const authoredTransparent = new WeakMap<Material, boolean>();

/**
 * Applies `opacity` to a material. It becomes `transparent` while below 1, and
 * goes back to what it was before. Returns `true` if the flag flipped (the
 * material is flagged for a refresh).
 */
export function applyOpacity(material: Material, opacity: number): boolean {
  if (!authoredTransparent.has(material)) authoredTransparent.set(material, material.transparent);
  const transparent = authoredTransparent.get(material)! || opacity < 1;
  material.opacity = opacity;
  if (material.transparent === transparent) return false;
  material.transparent = transparent;
  material.needsUpdate = true;
  return true;
}
