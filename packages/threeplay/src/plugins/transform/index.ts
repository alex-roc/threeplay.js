import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { definePlugin } from "../../core/engine.js";
import { deg2rad, rad2deg } from "../../core/math.js";
import type { Engine, GameObj } from "../../core/types.js";
import { self, targetPos, toVec3 } from "../../core/util.js";
import type {
  FollowComp,
  PosComp,
  PosTarget,
  RotateComp,
  ScaleComp,
  TransformAPI,
  Vec3Like,
} from "./types.js";

export type * from "./types.js";

const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();

/** Built-in plugin: `pos`, `rotate`, `scale` and `follow`. */
export const transformPlugin = definePlugin<TransformAPI>({
  name: "transform",
  install(k: Engine) {
    // Objects whose `rot` must be kept in sync with `object3d.rotation`.
    const rotating = new Set<GameObj>();
    // Last rotation (degrees) written to or read from each object3d.
    const lastRot = new WeakMap<GameObj, Vector3>();
    const following = new Set<GameObj>();

    /** Two-way sync: code changing `rot` wins; otherwise `rot` follows the node (physics, lookAt). */
    function syncRotation(obj: GameObj) {
      const rot = obj.rot as Vector3;
      const last = lastRot.get(obj)!;
      if (!rot.equals(last)) {
        obj.object3d.rotation.set(deg2rad(rot.x), deg2rad(rot.y), deg2rad(rot.z));
      } else {
        const r = obj.object3d.rotation;
        rot.set(rad2deg(r.x), rad2deg(r.y), rad2deg(r.z));
      }
      last.copy(rot);
    }

    // lateUpdate: after character controllers (physics afterUpdate) moved.
    k.hooks.on("lateUpdate", () => {
      for (const obj of following) {
        const f = obj.follow as FollowComp["follow"];
        if (!f.target?.exists()) continue;
        obj.setWorldPos(targetPos(f.target).add(f.offset));
      }
      for (const obj of rotating) syncRotation(obj);
    });
    // Also sync after fixed steps, so physics sees fresh rotations.
    k.hooks.on("beforeFixedUpdate", () => {
      for (const obj of rotating) syncRotation(obj);
    });

    function pos(x?: number | Vec3Like, y?: number, z?: number): PosComp {
      const initial = toVec3(x, y, z);
      return {
        id: "pos",
        get pos() {
          return self(this).object3d.position;
        },
        set pos(v: Vector3) {
          const p = self(this).object3d.position;
          p.set(v.x, v.y, v.z);
        },
        move(mx: number | Vec3Like, my?: number, mz?: number) {
          const obj = self(this);
          const vel = toVec3(mx, my, mz);
          const delta = vel.clone().multiplyScalar(k.dt());
          if (typeof obj.applyMove === "function") obj.applyMove(delta, vel);
          else obj.object3d.position.add(delta);
        },
        moveTo(target: PosTarget, speed?: number) {
          const obj = self(this);
          const dest = targetPos(target);
          if (obj.parent) obj.parent.object3d.worldToLocal(dest);
          const p = obj.object3d.position;
          if (speed === undefined) {
            obj.pos = dest;
            return;
          }
          const diff = dest.sub(p);
          const dist = diff.length();
          const stepLen = speed * k.dt();
          if (dist <= stepLen || dist === 0) obj.move(diff.divideScalar(Math.max(k.dt(), 1e-6)));
          else obj.move(diff.multiplyScalar(speed / dist));
        },
        worldPos() {
          return self(this).object3d.getWorldPosition(new Vector3());
        },
        setWorldPos(v: Vec3Like) {
          const obj = self(this);
          const local = new Vector3(v.x, v.y, v.z);
          if (obj.parent) {
            obj.parent.object3d.updateWorldMatrix(true, false);
            obj.parent.object3d.worldToLocal(local);
          }
          obj.object3d.position.copy(local);
        },
        distanceTo(target: PosTarget) {
          return self(this).worldPos().distanceTo(targetPos(target));
        },
        add() {
          self(this).object3d.position.copy(initial);
        },
        inspect() {
          const p = self(this).object3d.position;
          return `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
        },
      };
    }

    function rotate(x?: number, y?: number, z?: number): RotateComp {
      // rotate(90) is the common "turn around Y" case.
      const initial = y === undefined && z === undefined ? toVec3(0, x ?? 0, 0) : toVec3(x, y, z);
      return {
        id: "rotate",
        rot: initial.clone(),
        rotateBy(dx: number, dy?: number, dz?: number) {
          const obj = self(this);
          if (dy === undefined && dz === undefined) obj.rot.y += dx;
          else obj.rot.add(new Vector3(dx, dy ?? 0, dz ?? 0));
        },
        lookAt(target: PosTarget) {
          const obj = self(this);
          const node = obj.object3d;
          node.updateWorldMatrix(true, false);
          const from = node.getWorldPosition(new Vector3());
          const to = targetPos(target);
          if (from.distanceToSquared(to) < 1e-12) return;
          // -Z faces the target (same convention as cameras).
          _m.lookAt(from, to, UP);
          _q.setFromRotationMatrix(_m);
          if (node.parent) {
            node.parent.getWorldQuaternion(node.quaternion).invert();
            node.quaternion.multiply(_q);
          } else {
            node.quaternion.copy(_q);
          }
          _e.setFromQuaternion(node.quaternion);
          obj.rot.set(rad2deg(_e.x), rad2deg(_e.y), rad2deg(_e.z));
          node.rotation.copy(_e);
          lastRot.get(obj)?.copy(obj.rot);
        },
        forward() {
          const obj = self(this);
          syncRotation(obj);
          return new Vector3(0, 0, -1).applyQuaternion(obj.object3d.getWorldQuaternion(_q));
        },
        right() {
          const obj = self(this);
          syncRotation(obj);
          return new Vector3(1, 0, 0).applyQuaternion(obj.object3d.getWorldQuaternion(_q));
        },
        add() {
          const obj = self(this);
          lastRot.set(obj, new Vector3(Number.NaN, 0, 0)); // force the first write
          syncRotation(obj);
          rotating.add(obj);
        },
        destroy() {
          rotating.delete(self(this));
        },
        inspect() {
          const r = self(this).rot as Vector3;
          return `${r.x.toFixed(0)}°, ${r.y.toFixed(0)}°, ${r.z.toFixed(0)}°`;
        },
      };
    }

    function scale(x?: number | Vec3Like, y?: number, z?: number): ScaleComp {
      const initial = x === undefined ? new Vector3(1, 1, 1) : toVec3(x, y, z, true);
      return {
        id: "scale",
        get scale(): Vector3 {
          return self(this).object3d.scale;
        },
        set scale(v: Vector3 | number) {
          // obj.scale = 2 is uniform, like scale(2).
          self(this).object3d.scale.copy(toVec3(v, undefined, undefined, true));
        },
        scaleTo(sx: number, sy?: number, sz?: number) {
          self(this).object3d.scale.copy(toVec3(sx, sy, sz, true));
        },
        add() {
          self(this).object3d.scale.copy(initial);
        },
      };
    }

    function follow(target: GameObj | null, offset?: Vec3Like): FollowComp {
      return {
        id: "follow",
        require: ["pos"],
        follow: { target, offset: toVec3(offset) },
        add() {
          following.add(self(this));
        },
        destroy() {
          following.delete(self(this));
        },
      };
    }

    return { pos, rotate, scale, follow };
  },
});
