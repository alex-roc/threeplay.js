import { Quaternion, Vector3 } from "three";
import { deg2rad, rad2deg } from "../../core/math";
import type { GameObj } from "../../core/types";
import type { Vec3Like } from "../transform/types";
import { buildCollider } from "./collider";
import { ContactTracker } from "./contacts";
import type { RapierBackend } from "./rapier";
import { createState, isSensorOf, kindOf, type PhysState } from "./state";
import type { RaycastHit, RaycastOpts } from "./types";

const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _pq = new Quaternion();
const DOWN = { x: 0, y: -1, z: 0 };
/** How far below the collider the ground probe still counts as grounded. */
const GROUND_PROBE = 0.1;
/** The probe starts this far inside the collider so touching surfaces are hit. */
const PROBE_INSET = 0.05;

/**
 * The runtime behind `area()`, `body()` and `character()`: owns the per-object
 * state, creates and removes Rapier bodies, syncs transforms and emits contacts.
 * With `backend = null` (`physics: false`) every method is a harmless no-op.
 */
export class PhysicsSystem {
  readonly states = new Map<GameObj, PhysState>();
  private readonly byCollider = new Map<number, PhysState>();
  /** Objects waiting for their body (new components, or Rapier still loading). */
  private readonly pending = new Set<PhysState>();
  /** Bodies driven by code (area-only, kinematic, character): pushed to the world. */
  private readonly driven = new Set<PhysState>();
  private readonly dynamics = new Set<PhysState>();
  private readonly characters = new Set<PhysState>();
  private readonly groundWatch = new Set<PhysState>();
  private readonly forced = new Set<PhysState>();
  private readonly contacts: ContactTracker;
  private warned = false;

  constructor(readonly backend: RapierBackend | null) {
    this.contacts = new ContactTracker({
      stateOf: (h) => this.byCollider.get(h),
      normalBetween: (a, b) => this.normalBetween(a, b),
    });
  }

  /** `false` when physics is disabled with `physics: false`. */
  get enabled() {
    return this.backend !== null;
  }

  /** Warns once that components are inert because physics is off. */
  warnDisabled(comp: string) {
    if (this.enabled || this.warned) return;
    this.warned = true;
    console.warn(
      `[threeplay] ${comp}() was used but physics is disabled (physics: false): components do nothing.`,
    );
  }

  /** The state of an object, created on its first physics component. */
  ensure(obj: GameObj): PhysState {
    let s = this.states.get(obj);
    if (!s) {
      s = createState(obj);
      this.states.set(obj, s);
    }
    return s;
  }

  // --- bodies ----------------------------------------------------------------

  /** Something about the components changed: rebuild the body on the next flush. */
  markDirty(s: PhysState) {
    if (!this.enabled) return;
    if (s.rb) this.unbuild(s, true);
    this.pending.add(s);
  }

  /** Builds the body now if the object is ready (called from `objectAdd`). */
  flushObject(obj: GameObj) {
    const s = this.states.get(obj);
    if (s && this.pending.has(s)) this.build(s);
  }

  /** Forgets an object for good (it was destroyed or lost `area()`). */
  remove(obj: GameObj) {
    const s = this.states.get(obj);
    if (!s) return;
    this.unbuild(s, false);
    this.pending.delete(s);
    this.groundWatch.delete(s);
    this.states.delete(obj);
  }

  /** Marks that `obj` wants "ground" events (bodies check their ground probe each step). */
  watchGround(s: PhysState) {
    this.groundWatch.add(s);
  }

  private build(s: PhysState) {
    const be = this.backend;
    if (!be?.ready || !be.world || !be.native) return;
    this.pending.delete(s);
    if (!s.obj.exists() || s.rb) return;
    const R = be.native;
    const world = be.world;
    const obj = s.obj;
    s.kind = kindOf(s);
    this.worldTransform(obj);

    const desc =
      s.kind === "dynamic"
        ? R.RigidBodyDesc.dynamic()
        : s.kind === "static"
          ? R.RigidBodyDesc.fixed()
          : R.RigidBodyDesc.kinematicPositionBased();
    desc.setTranslation(_p.x, _p.y, _p.z).setRotation(_q);
    const b = s.body;
    if (b && s.kind === "dynamic") {
      desc.setGravityScale(b.gravityScale ?? 1);
      desc.setLinearDamping(b.damping ?? 0);
      desc.setAngularDamping(b.angularDamping ?? 0.05);
      if (b.lockRotation) desc.lockRotations();
      if (b.ccd) desc.setCcdEnabled(true);
      desc.setLinvel(s.vel.x, s.vel.y, s.vel.z);
      desc.setAngvel({
        x: deg2rad(s.angVel.x),
        y: deg2rad(s.angVel.y),
        z: deg2rad(s.angVel.z),
      });
    }
    const rb = world.createRigidBody(desc);

    const built = buildCollider(R, obj, s.area, {
      sensor: isSensorOf(s),
      dynamic: s.kind === "dynamic",
    });
    if (b?.mass !== undefined && s.kind === "dynamic") built.desc.setMass(b.mass);
    const collider = world.createCollider(built.desc, rb);
    s.rb = rb;
    s.collider = collider;
    s.bottom = built.bottom;
    s.desired.set(0, 0, 0);
    s.lastPos.copy(_p);
    s.lastQuat.copy(_q);
    this.byCollider.set(collider.handle, s);

    if (s.kind === "character") {
      const c = s.character!;
      const ctl = world.createCharacterController(0.01);
      ctl.setUp({ x: 0, y: 1, z: 0 });
      ctl.setSlideEnabled(true);
      const slope = deg2rad(c.maxSlope ?? 45);
      ctl.setMaxSlopeClimbAngle(slope);
      ctl.setMinSlopeSlideAngle(slope);
      ctl.enableAutostep(c.stepHeight ?? 0.3, 0.1, false);
      ctl.enableSnapToGround(c.snapToGround ?? 0.3);
      s.controller = ctl;
      this.characters.add(s);
      this.driven.add(s);
    } else if (s.kind === "dynamic") {
      this.dynamics.add(s);
    } else if (s.kind === "kinematic" || s.kind === "area") {
      this.driven.add(s);
    }
  }

  /** Removes the Rapier body of `s`, ending its contacts. */
  private unbuild(s: PhysState, rebuilding: boolean) {
    this.contacts.endAll(s, rebuilding);
    this.driven.delete(s);
    this.dynamics.delete(s);
    this.characters.delete(s);
    this.forced.delete(s);
    s.forced = false;
    if (s.collider) this.byCollider.delete(s.collider.handle);
    const world = this.backend?.world;
    if (world) {
      if (s.controller) world.removeCharacterController(s.controller);
      if (s.rb) world.removeRigidBody(s.rb); // takes its colliders with it
    }
    s.rb = null;
    s.collider = null;
    s.controller = null;
    s.grounded = false;
  }

  // --- frame hooks --------------------------------------------------------------

  /** `beforeFixedUpdate`: create pending bodies and push code-driven transforms. */
  beforeFixed() {
    if (!this.backend?.ready) return;
    for (const s of [...this.pending]) this.build(s);
    for (const s of this.driven) {
      this.worldTransform(s.obj);
      s.rb!.setNextKinematicTranslation(_p);
      s.rb!.setNextKinematicRotation(_q);
    }
    for (const s of this.dynamics) {
      this.worldTransform(s.obj);
      if (_p.equals(s.lastPos) && _q.equals(s.lastQuat)) continue;
      // Changed by code since physics last wrote it: teleport the body.
      s.rb!.setTranslation(_p, true);
      s.rb!.setRotation(_q, true);
      s.lastPos.copy(_p);
      s.lastQuat.copy(_q);
    }
  }

  /** `afterFixedUpdate`: step the world, copy bodies back and emit contacts. */
  afterFixed(dt: number) {
    const be = this.backend;
    if (!be?.ready) return;
    be.step(dt);
    for (const s of this.dynamics) this.writeBack(s);
    be.drainCollisions((h1, h2, started) => {
      if (started) this.contacts.start(h1, h2);
      else this.contacts.end(h1, h2);
    });
    this.contacts.update();
    for (const s of [...this.groundWatch]) {
      if (!s.rb || !s.obj.exists()) continue;
      const g = this.probeGround(s);
      if (g && !s.grounded) s.obj.trigger("ground");
      s.grounded = g;
    }
    for (const s of this.forced) s.forced = true; // consumed by this step
  }

  /** `beforeUpdate`: forces applied last frame have been used by the fixed steps. */
  beforeUpdate() {
    for (const s of this.forced) {
      if (!s.forced) continue; // applied after the last step
      s.rb?.resetForces(false);
      s.rb?.resetTorques(false);
      this.forced.delete(s);
      s.forced = false;
    }
  }

  /** `afterUpdate`: move characters (once per rendered frame, so cameras never jitter). */
  afterUpdate(dt: number) {
    const be = this.backend;
    if (!be?.ready || dt <= 0) return;
    for (const s of this.characters) this.stepCharacter(s, dt);
  }

  private worldTransform(obj: GameObj) {
    obj.object3d.updateWorldMatrix(true, false);
    obj.object3d.matrixWorld.decompose(_p, _q, _s);
  }

  /** Writes a dynamic body's pose to its object (converted to local space). */
  private writeBack(s: PhysState) {
    const rb = s.rb!;
    if (rb.isSleeping()) return;
    const t = rb.translation();
    const r = rb.rotation();
    const node = s.obj.object3d;
    _p.set(t.x, t.y, t.z);
    _q.set(r.x, r.y, r.z, r.w);
    const parent = node.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(_p);
      parent.getWorldQuaternion(_pq).invert();
      _q.premultiply(_pq);
    }
    node.position.copy(_p);
    node.quaternion.copy(_q);
    this.worldTransform(s.obj);
    s.lastPos.copy(_p);
    s.lastQuat.copy(_q);
  }

  /** Sets the world position of an object (converting to its parent's space). */
  setWorldPosition(obj: GameObj, v: Vec3Like) {
    const node = obj.object3d;
    node.position.set(v.x, v.y, v.z);
    if (node.parent) {
      node.parent.updateWorldMatrix(true, false);
      node.parent.worldToLocal(node.position);
    }
  }

  // --- characters ---------------------------------------------------------------

  /** Queues a displacement for the character's next step. */
  moveCharacter(s: PhysState, delta: Vector3) {
    s.desired.add(delta);
  }

  private stepCharacter(s: PhysState, dt: number) {
    const be = this.backend!;
    const world = be.world!;
    const R = be.native!;
    const rb = s.rb!;
    const ctl = s.controller!;
    const obj = s.obj;

    // The object is the source of truth (code may have moved it): sync the body to it.
    this.worldTransform(obj);
    rb.setTranslation(_p, true);
    world.propagateModifiedBodyPositionsToColliders();

    s.vel.y += be.getGravity().y * (s.character?.gravityScale ?? 1) * dt;
    const desired = s.desired.clone();
    desired.y += s.vel.y * dt;
    s.desired.set(0, 0, 0);

    ctl.computeColliderMovement(s.collider!, desired, R.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = ctl.computedMovement();
    const grounded = ctl.computedGrounded();
    if (grounded && s.vel.y < 0) s.vel.y = 0;
    else if (desired.y > 0 && m.y < desired.y - 1e-4) s.vel.y = Math.min(s.vel.y, 0); // ceiling

    _p.add(m);
    this.setWorldPosition(obj, _p);
    rb.setNextKinematicTranslation(_p);
    rb.setTranslation(_p, true);
    s.lastPos.copy(_p);
    const landed = grounded && !s.grounded;
    s.grounded = grounded;
    if (landed) obj.trigger("ground");
  }

  // --- bodies: velocity, ground, teleport ----------------------------------------

  /** A live `Vector3` over a rigid body quantity (writes go straight to the body). */
  liveVector(
    s: PhysState,
    read: (rb: NonNullable<PhysState["rb"]>) => Vec3Like,
    write: (rb: NonNullable<PhysState["rb"]>, x: number, y: number, z: number) => void,
    fallback: Vector3,
  ): Vector3 {
    const v = new Vector3();
    for (const axis of ["x", "y", "z"] as const) {
      Object.defineProperty(v, axis, {
        enumerable: true,
        configurable: true,
        get: () => (s.rb ? read(s.rb)[axis] : fallback[axis]),
        set: (n: number) => {
          const cur = s.rb ? read(s.rb) : fallback;
          const x = axis === "x" ? n : cur.x;
          const y = axis === "y" ? n : cur.y;
          const z = axis === "z" ? n : cur.z;
          if (s.rb) write(s.rb, x, y, z);
          else fallback.set(x, y, z);
        },
      });
    }
    return v;
  }

  /** The `vel` view of a body, in units/s. */
  velocityOf(s: PhysState): Vector3 {
    s.liveVel ??= this.liveVector(
      s,
      (rb) => rb.linvel(),
      (rb, x, y, z) => rb.setLinvel({ x, y, z }, true),
      s.vel,
    );
    return s.liveVel;
  }

  /** The `angularVel` view of a body, in degrees/s. */
  angularVelocityOf(s: PhysState): Vector3 {
    s.liveAng ??= this.liveVector(
      s,
      (rb) => {
        const a = rb.angvel();
        return { x: rad2deg(a.x), y: rad2deg(a.y), z: rad2deg(a.z) };
      },
      (rb, x, y, z) => rb.setAngvel({ x: deg2rad(x), y: deg2rad(y), z: deg2rad(z) }, true),
      s.angVel,
    );
    return s.liveAng;
  }

  /** `move()` on a body: dynamic bodies get the horizontal velocity, others are translated. */
  moveBody(s: PhysState, delta: Vector3, velocity: Vector3) {
    if (s.kind === "dynamic" || (!s.rb && s.body && !s.body.isStatic && !s.body.kinematic)) {
      const v = this.velocityOf(s);
      v.x = velocity.x;
      v.z = velocity.z;
      return;
    }
    s.obj.object3d.position.add(delta);
  }

  /** `true` if something solid is just below the collider. */
  probeGround(s: PhysState): boolean {
    const be = this.backend;
    if (s.kind === "character") return s.grounded;
    if (!be?.world || !be.native || !s.rb || !s.collider) return false;
    const t = s.rb.translation();
    const origin = { x: t.x, y: t.y - s.bottom + PROBE_INSET, z: t.z };
    const ray = new be.native.Ray(origin, DOWN);
    const hit = be.world.castRay(
      ray,
      PROBE_INSET + GROUND_PROBE,
      true,
      be.native.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      s.collider,
    );
    return hit !== null;
  }

  /** Moves a body to a world position, resetting its velocity. */
  teleport(s: PhysState, to: Vec3Like) {
    this.setWorldPosition(s.obj, to);
    s.vel.set(0, 0, 0);
    s.desired.set(0, 0, 0);
    const rb = s.rb;
    if (!rb) return;
    this.worldTransform(s.obj);
    rb.setTranslation(_p, true);
    s.lastPos.copy(_p);
    if (s.kind === "dynamic") {
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Adds a force that acts during the next frame's fixed steps. */
  applyForce(s: PhysState, f: Vec3Like) {
    if (!s.rb) return;
    s.rb.addForce({ x: f.x, y: f.y, z: f.z }, true);
    s.forced = false;
    this.forced.add(s);
  }

  // --- queries -------------------------------------------------------------------

  raycast(origin: Vec3Like, dir: Vec3Like, maxDist: number, opts: RaycastOpts): RaycastHit | null {
    const be = this.backend;
    if (!be?.world || !be.native) return null;
    const d = new Vector3(dir.x, dir.y, dir.z);
    if (d.lengthSq() === 0) return null;
    d.normalize();
    const exclude = opts.exclude;
    const hit = be.world.castRayAndGetNormal(
      new be.native.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: d.x, y: d.y, z: d.z }),
      maxDist,
      true,
      opts.sensors ? undefined : be.native.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const s = this.byCollider.get(collider.handle);
        if (!s) return false;
        if (exclude?.includes(s.obj)) return false;
        return !opts.tag || s.obj.is(opts.tag);
      },
    );
    if (!hit) return null;
    const obj = this.byCollider.get(hit.collider.handle)!.obj;
    return {
      obj,
      point: new Vector3(
        origin.x + d.x * hit.timeOfImpact,
        origin.y + d.y * hit.timeOfImpact,
        origin.z + d.z * hit.timeOfImpact,
      ),
      normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: hit.timeOfImpact,
    };
  }

  /** Contact normal from `a` towards `b`, taken from the narrow phase. */
  private normalBetween(a: PhysState, b: PhysState): Vector3 | null {
    const world = this.backend?.world;
    if (!world || !a.collider || !b.collider) return null;
    let out: Vector3 | null = null;
    world.contactPair(a.collider, b.collider, (manifold, flipped) => {
      if (out) return;
      const n = manifold.normal();
      const v = new Vector3(n.x, n.y, n.z);
      if (v.lengthSq() < 1e-12) return;
      out = flipped ? v.negate() : v;
    });
    return out;
  }
}
