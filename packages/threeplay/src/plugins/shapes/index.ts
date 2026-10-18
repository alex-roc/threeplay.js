import { type BufferGeometry, Color, Material, Mesh, type Texture } from "three";
import { definePlugin } from "../../core/engine";
import { rgb, toColor } from "../../core/math";
import type { ColorLike, Engine, GameObj, TimerController } from "../../core/types";
import { self } from "../../core/util";
import { DEFAULT_SEGMENTS, makeGeometry } from "./geometry";
import {
  applyOpacity,
  collectMaterials,
  createMaterial,
  defaultMaterial,
  repeatedTexture,
  repeatOf,
  shareColor,
} from "./materials";
import type {
  ColorComp,
  MaterialOpts,
  OpacityComp,
  PrimitiveComp,
  ShapeDesc,
  ShapeOpts,
  ShapesAPI,
} from "./types";

export type * from "./types";

/**
 * Built-in plugin: primitive shapes (`box`, `sphere`, `capsule`, `cylinder`,
 * `cone`, `plane`, `mesh`) and the look components `color`, `opacity` and
 * `material`.
 */
export const shapesPlugin = definePlugin<ShapesAPI>({
  name: "shapes",
  dependencies: ["transform"],
  install(k: Engine) {
    // Materials this plugin created (and so may dispose); user-provided ones are left alone.
    const owned = new WeakSet<Material>();

    /** Gives the object's materials its `color` (same instance), if it has one. */
    function syncColor(obj: GameObj) {
      if (obj.color instanceof Color && obj.mesh) shareColor(obj.mesh as Mesh, obj.color);
    }

    function primitive(
      shape: ShapeDesc,
      geometry: BufferGeometry,
      material: Material | undefined,
      ownsGeometry: boolean,
      opts: ShapeOpts = {},
    ): PrimitiveComp {
      const mat = material ?? defaultMaterial();
      if (!material) owned.add(mat);
      const mesh = new Mesh(geometry, mat);
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      return {
        id: "shape",
        shape,
        mesh,
        add() {
          const obj = self(this);
          obj.object3d.add(mesh);
          syncColor(obj);
        },
        destroy() {
          mesh.removeFromParent();
          if (ownsGeometry) geometry.dispose();
          for (const m of collectMaterials(mesh)) if (owned.has(m)) m.dispose();
        },
        inspect: () => shape.kind,
      };
    }

    const seg = (opts?: ShapeOpts) => opts?.segments ?? DEFAULT_SEGMENTS;
    const shaped = (shape: ShapeDesc, opts?: ShapeOpts) =>
      primitive(shape, makeGeometry(shape, seg(opts)), undefined, true, opts);

    function box(width = 1, height = width, depth = width, opts?: ShapeOpts) {
      return shaped({ kind: "box", width, height, depth }, opts);
    }
    function sphere(radius = 0.5, opts?: ShapeOpts) {
      return shaped({ kind: "sphere", radius }, opts);
    }
    function capsule(radius = 0.5, height = 2, opts?: ShapeOpts) {
      return shaped({ kind: "capsule", radius, height }, opts);
    }
    function cylinder(radius = 0.5, height = 1, opts?: ShapeOpts) {
      return shaped({ kind: "cylinder", radius, height }, opts);
    }
    function cone(radius = 0.5, height = 1, opts?: ShapeOpts) {
      return shaped({ kind: "cone", radius, height }, opts);
    }
    function plane(width = 10, depth = width, opts?: ShapeOpts) {
      return shaped({ kind: "plane", width, depth }, opts);
    }
    function mesh(geometry: BufferGeometry, material?: Material, opts?: ShapeOpts) {
      return primitive({ kind: "mesh" }, geometry, material, false, opts);
    }

    function color(c?: ColorLike | number, g?: number, b?: number): ColorComp {
      // One Color instance for the object's whole life: materials share it, so
      // `obj.color.set(...)` and `obj.color = ...` both show up without extra work.
      const value = rgb(c, g, b);
      return {
        id: "color",
        get color() {
          return value;
        },
        set color(v: ColorLike) {
          value.copy(toColor(v));
        },
        add() {
          syncColor(self(this));
        },
        inspect: () => `#${value.getHexString()}`,
      } as ColorComp;
    }

    function opacity(initial = 1): OpacityComp {
      let fading: TimerController | null = null;
      function apply(obj: GameObj) {
        const root = obj.mesh as Mesh | undefined;
        if (!root) return; // HUD objects just keep the number
        const o = Math.min(1, Math.max(0, obj.opacity as number));
        const single = root.material;
        if (single && !Array.isArray(single)) applyOpacity(single, o);
        else for (const m of collectMaterials(root)) applyOpacity(m, o);
      }
      return {
        id: "opacity",
        opacity: initial,
        fadeOut(seconds: number, destroy = false) {
          const obj = self(this);
          fading?.cancel();
          fading = k.tween(obj.opacity as number, 0, seconds, (v) => {
            obj.opacity = v;
          });
          if (destroy) {
            fading.then(() => {
              if (obj.exists()) obj.destroy();
            });
          }
        },
        add() {
          apply(self(this));
        },
        update() {
          apply(self(this));
        },
        destroy() {
          fading?.cancel();
        },
        inspect() {
          return (self(this).opacity as number).toFixed(2);
        },
      };
    }

    function material(spec: MaterialOpts | Material) {
      const instance = spec instanceof Material;
      const mat = instance ? spec : createMaterial(spec);
      if (!instance) owned.add(mat);
      const opts: MaterialOpts = instance ? {} : spec;
      const repeat = repeatOf(opts.repeat);
      const setMap = (texture: Texture) => {
        (mat as Material & { map: Texture | null }).map = repeat
          ? repeatedTexture(texture, repeat)
          : texture;
        mat.needsUpdate = true;
      };
      // A texture given by name may not be loaded yet (or the assets plugin may be absent).
      let pendingMap = typeof opts.map === "string" ? opts.map : null;
      if (opts.map && typeof opts.map !== "string") setMap(opts.map);
      const resolveMap = () => {
        if (!pendingMap) return;
        const assets = k.plugins.assets as { getTexture?(name: string): Texture | undefined };
        const texture = assets?.getTexture?.(pendingMap);
        if (!texture) return;
        pendingMap = null;
        setMap(texture);
      };
      return {
        id: "material" as const,
        material: mat,
        add() {
          const obj = self(this);
          resolveMap();
          (obj.mesh as Mesh | undefined)?.traverse((node) => {
            const m = node as Mesh;
            if (!m.isMesh || m.material === mat) return;
            const old = m.material;
            m.material = mat;
            for (const o of Array.isArray(old) ? old : [old]) if (owned.has(o)) o.dispose();
          });
          syncColor(obj);
        },
        update() {
          resolveMap();
        },
      };
    }

    return { box, sphere, capsule, cylinder, cone, plane, mesh, color, opacity, material };
  },
});
