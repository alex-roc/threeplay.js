import type { ColliderDesc } from "@dimforge/rapier3d-compat";
import { Box3, type BufferGeometry, Matrix4, type Mesh, type Object3D, Vector3 } from "three";
import type { GameObj } from "../../core/types";
import type { ShapeDesc } from "../shapes/types";
import type { Rapier } from "./rapier";
import type { AreaOpts } from "./types";

/** A collider description plus what the plugin needs to know about it. */
export interface BuiltCollider {
  desc: ColliderDesc;
  /** Distance from the body origin down to the bottom of the collider. */
  bottom: number;
}

/** What the collider needs to know about the body it is attached to. */
export interface ColliderCtx {
  sensor: boolean;
  /** Dynamic bodies can't use trimeshes. */
  dynamic: boolean;
}

/** Thickness of the box standing in for a plane. */
const PLANE_HALF_THICKNESS = 0.005;
const MIN_HALF = 1e-3;

const _inv = new Matrix4();
const _rel = new Matrix4();
const _box = new Box3();
const _v = new Vector3();

/** Visits the geometry of an object's own meshes (not those of its child objects). */
function eachMesh(obj: GameObj, fn: (mesh: Mesh) => void) {
  const root: Object3D = obj.mesh ?? obj.object3d;
  const visit = (node: Object3D) => {
    const owner = node.userData.gameObj;
    if (owner && owner !== obj) return; // a child game object
    if ((node as Mesh).isMesh && (node as Mesh).geometry) fn(node as Mesh);
    for (const child of node.children) visit(child);
  };
  visit(root);
}

/** Matrix taking a mesh's local space to the object's own local space (unscaled). */
function toObjectSpace(obj: GameObj, mesh: Mesh): Matrix4 {
  _inv.copy(obj.object3d.matrixWorld).invert();
  return _rel.multiplyMatrices(_inv, mesh.matrixWorld);
}

/** Bounding box of an object's meshes, in its own local space. Empty if there is none. */
function localBounds(obj: GameObj): Box3 {
  const out = new Box3();
  eachMesh(obj, (mesh) => {
    const geo: BufferGeometry = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingBox) return;
    _box.copy(geo.boundingBox).applyMatrix4(toObjectSpace(obj, mesh));
    out.union(_box);
  });
  return out;
}

/** Vertices (scaled, in the object's local space) and indices of all the object's meshes. */
function gatherGeometry(obj: GameObj, scale: Vector3) {
  const verts: number[] = [];
  const indices: number[] = [];
  eachMesh(obj, (mesh) => {
    const pos = mesh.geometry.getAttribute("position");
    if (!pos) return;
    const m = toObjectSpace(obj, mesh);
    const base = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m).multiply(scale);
      verts.push(_v.x, _v.y, _v.z);
    }
    const index = mesh.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) indices.push(base + i);
  });
  return { vertices: new Float32Array(verts), indices: new Uint32Array(indices) };
}

/** Local size of an analytic shape. */
function sizeOf(d: ShapeDesc): Vector3 | null {
  switch (d.kind) {
    case "box":
      return new Vector3(d.width, d.height, d.depth);
    case "sphere":
      return new Vector3(2 * d.radius, 2 * d.radius, 2 * d.radius);
    case "capsule":
    case "cylinder":
    case "cone":
      return new Vector3(2 * d.radius, d.height, 2 * d.radius);
    case "plane":
      return new Vector3(d.width, 2 * PLANE_HALF_THICKNESS, d.depth);
    default:
      return null;
  }
}

/**
 * Builds the collider of an object from `area()` options and its `shape`.
 * The object's world scale is baked in: scaling it later does not resize the collider.
 */
export function buildCollider(
  R: Rapier,
  obj: GameObj,
  opts: AreaOpts,
  ctx: ColliderCtx,
): BuiltCollider {
  const node = obj.object3d;
  node.updateWorldMatrix(true, true);
  const scale = node.getWorldScale(new Vector3());
  scale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));

  const shape: ShapeDesc | undefined = obj.shape;
  const wanted = opts.shape ?? "auto";
  const offset = new Vector3();
  if (opts.offset) offset.set(opts.offset.x, opts.offset.y, opts.offset.z).multiply(scale);

  // Local size and center of the collider's bounding box.
  const size = new Vector3(1, 1, 1);
  const center = new Vector3();
  const analytic = opts.size ? null : shape ? sizeOf(shape) : null;
  let bounded = true;
  if (opts.size) {
    size.set(opts.size.x, opts.size.y, opts.size.z);
  } else if (analytic) {
    size.copy(analytic);
  } else {
    const b = localBounds(obj);
    if (b.isEmpty()) {
      bounded = false;
      console.warn(
        "[threeplay] area() found no shape to build a collider from: using a 1x1x1 cube. " +
          "Add a shape (box(), sphere(), model...) or pass area({ size }).",
      );
    } else {
      b.getSize(size);
      b.getCenter(center);
    }
  }
  const half = size.clone().multiplyScalar(0.5).multiply(scale);
  half.set(Math.max(half.x, MIN_HALF), Math.max(half.y, MIN_HALF), Math.max(half.z, MIN_HALF));
  center.multiply(scale).add(offset);

  let kind: "box" | "sphere" | "capsule" | "cylinder" | "cone" | "plane" | "mesh" | "hull";
  if (wanted !== "auto") kind = wanted;
  else if (opts.size) kind = "box";
  else kind = shape && shape.kind !== "mesh" && shape.kind !== "model" ? shape.kind : "box";

  // Geometry-based colliders.
  if ((kind === "mesh" || kind === "hull") && bounded) {
    const g = gatherGeometry(obj, scale);
    let desc: ColliderDesc | null = null;
    let effective = kind;
    if (kind === "mesh" && ctx.dynamic) {
      console.warn(
        '[threeplay] area({ shape: "mesh" }) can\'t be used with a dynamic body: using a convex hull.',
      );
      effective = "hull";
    }
    if (effective === "mesh") desc = R.ColliderDesc.trimesh(g.vertices, g.indices);
    else desc = R.ColliderDesc.convexHull(g.vertices);
    if (desc) {
      let minY = Number.POSITIVE_INFINITY;
      for (let i = 1; i < g.vertices.length; i += 3) minY = Math.min(minY, g.vertices[i]);
      desc.setTranslation(offset.x, offset.y, offset.z);
      return finish(R, desc, opts, ctx, -(minY + offset.y));
    }
    // Degenerate geometry: fall through to the bounding box.
  }

  let desc: ColliderDesc;
  const radius = Math.max(half.x, half.z);
  let halfY = half.y;
  switch (kind) {
    case "sphere":
      halfY = Math.max(half.x, half.y, half.z);
      desc = R.ColliderDesc.ball(halfY);
      break;
    case "capsule": {
      const body = Math.max(half.y - radius, MIN_HALF);
      halfY = body + radius;
      desc = R.ColliderDesc.capsule(body, radius);
      break;
    }
    case "cylinder":
      desc = R.ColliderDesc.cylinder(half.y, radius);
      break;
    case "cone":
      desc = R.ColliderDesc.cone(half.y, radius);
      break;
    case "plane":
      // The top face sits at the object's origin, like the visible plane.
      desc = R.ColliderDesc.cuboid(half.x, PLANE_HALF_THICKNESS, half.z);
      center.y -= PLANE_HALF_THICKNESS;
      break;
    default:
      desc = R.ColliderDesc.cuboid(half.x, half.y, half.z);
  }
  desc.setTranslation(center.x, center.y, center.z);
  return finish(R, desc, opts, ctx, halfY - center.y);
}

/** Properties shared by every collider. */
function finish(
  R: Rapier,
  desc: ColliderDesc,
  opts: AreaOpts,
  ctx: ColliderCtx,
  bottom: number,
): BuiltCollider {
  desc.setSensor(ctx.sensor);
  desc.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
  desc.setActiveCollisionTypes(R.ActiveCollisionTypes.ALL);
  if (opts.friction !== undefined) desc.setFriction(opts.friction);
  if (opts.restitution !== undefined) desc.setRestitution(opts.restitution);
  return { desc, bottom };
}
