import type * as THREE from "three";
import type { ColorLike } from "../../core/types";

/**
 * Describes the geometry of an object so other plugins (physics colliders,
 * debug) can reason about it without inspecting three.js geometry.
 * Sizes are in local units, before `scale`.
 */
export type ShapeDesc =
  | { kind: "box"; width: number; height: number; depth: number }
  | { kind: "sphere"; radius: number }
  | { kind: "capsule"; radius: number; height: number }
  | { kind: "cylinder"; radius: number; height: number }
  | { kind: "cone"; radius: number; height: number }
  | { kind: "plane"; width: number; depth: number }
  /** Arbitrary geometry: colliders use its bounding box, or a trimesh/hull on request. */
  | { kind: "mesh" }
  /** A loaded model (assets plugin): same as `mesh`. */
  | { kind: "model" };

/**
 * Contract: any component that gives an object a visible shape exposes
 * `shape` (its description) and `mesh` (the three.js object that holds the
 * geometry, a child of `object3d`).
 */
export interface ShapeComp {
  shape: ShapeDesc;
  mesh: THREE.Object3D;
}

/** Options shared by the primitive shapes. */
export interface ShapeOpts {
  /** Cast shadows (default `true`). */
  castShadow?: boolean;
  /** Receive shadows (default `true`). */
  receiveShadow?: boolean;
  /** Geometry detail for round shapes (default 24). */
  segments?: number;
}

/** A primitive shape component. Its `id` is `"shape"`, so an object has only one. */
export interface PrimitiveComp extends ShapeComp {
  id: "shape";
  mesh: THREE.Mesh;
}

/** Fields added by `color()`. Applies to the mesh material, and to HUD elements. */
export interface ColorComp {
  id: "color";
  color: THREE.Color;
}

/** Fields added by `opacity()`. */
export interface OpacityComp {
  id: "opacity";
  opacity: number;
  /** Fades to 0 in `seconds`, then destroys the object if `destroy` is set. */
  fadeOut(seconds: number, destroy?: boolean): void;
}

/** Material options for `material()`. */
export interface MaterialOpts {
  /** `"standard"` (default, PBR), `"basic"` (unlit), `"toon"`, `"lambert"`, `"phong"`. */
  type?: "standard" | "basic" | "toon" | "lambert" | "phong";
  roughness?: number;
  metalness?: number;
  emissive?: ColorLike;
  emissiveIntensity?: number;
  wireframe?: boolean;
  flatShading?: boolean;
  /** Texture name loaded with `loadTexture()`, or a `THREE.Texture`. */
  map?: string | THREE.Texture;
  /** How many times the texture repeats (default 1). */
  repeat?: number | [number, number];
}

/** API of the shapes plugin. */
export interface ShapesAPI {
  box(width?: number, height?: number, depth?: number, opts?: ShapeOpts): PrimitiveComp;
  sphere(radius?: number, opts?: ShapeOpts): PrimitiveComp;
  /** `height` is the total height, including the round caps. */
  capsule(radius?: number, height?: number, opts?: ShapeOpts): PrimitiveComp;
  cylinder(radius?: number, height?: number, opts?: ShapeOpts): PrimitiveComp;
  cone(radius?: number, height?: number, opts?: ShapeOpts): PrimitiveComp;
  /** A flat rectangle on the XZ plane (a floor), facing up. */
  plane(width?: number, depth?: number, opts?: ShapeOpts): PrimitiveComp;
  /** Any three.js geometry and (optional) material. */
  mesh(geometry: THREE.BufferGeometry, material?: THREE.Material, opts?: ShapeOpts): PrimitiveComp;
  /** Component: color of the shape (or HUD element). */
  color(c?: ColorLike | number, g?: number, b?: number): ColorComp;
  /** Component: opacity 0–1. */
  opacity(value?: number): OpacityComp;
  /** Component: replaces the material of the shape. */
  material(opts: MaterialOpts | THREE.Material): { id: "material"; material: THREE.Material };
}

declare module "../../core/types" {
  interface PluginRegistry {
    shapes: ShapesAPI;
  }
}
