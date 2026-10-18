import {
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import type { ShapeDesc } from "./types.js";

/** Default geometry detail for round shapes. */
export const DEFAULT_SEGMENTS = 24;

/**
 * Builds the three.js geometry for a {@link ShapeDesc}. Everything is centered
 * on the origin; the plane lies on XZ facing up. `mesh` and `model` have no
 * geometry of their own and throw.
 */
export function makeGeometry(shape: ShapeDesc, segments = DEFAULT_SEGMENTS): BufferGeometry {
  const seg = Math.max(3, Math.round(segments));
  switch (shape.kind) {
    case "box":
      return new BoxGeometry(shape.width, shape.height, shape.depth);
    case "sphere":
      return new SphereGeometry(shape.radius, seg, Math.max(2, Math.round(seg / 2)));
    case "capsule":
      // CapsuleGeometry takes the length of the straight part; `height` is the total.
      return new CapsuleGeometry(
        shape.radius,
        Math.max(0, shape.height - 2 * shape.radius),
        Math.max(2, Math.round(seg / 4)),
        seg,
      );
    case "cylinder":
      return new CylinderGeometry(shape.radius, shape.radius, shape.height, seg);
    case "cone":
      return new ConeGeometry(shape.radius, shape.height, seg);
    case "plane": {
      const geometry = new PlaneGeometry(shape.width, shape.depth);
      geometry.rotateX(-Math.PI / 2); // PlaneGeometry faces +Z; make it a floor
      return geometry;
    }
    default:
      throw new Error(`Shape "${shape.kind}" has no geometry of its own: pass one to mesh().`);
  }
}
