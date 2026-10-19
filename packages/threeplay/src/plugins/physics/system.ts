import { Quaternion, Vector3 } from "three";
import { deg2rad, rad2deg } from "../../core/math.js";
import type { GameObj } from "../../core/types.js";
import type { Vec3Like } from "../transform/types.js";
import { buildCollider } from "./collider.js";
import { ContactTracker } from "./contacts.js";
import type { RapierBackend } from "./rapier.js";
import { createState, isSensorOf, kindOf, type PhysState } from "./state.js";
import type { RaycastHit, RaycastOpts } from "./types.js";

const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _pq = new Quaternion();
const _wp = new Vector3();
const _wq = new Quaternion();
const _ip = new Vector3();
const _iq = new Quaternion();
const DOWN = { x: 0, y: -1, z: 0 };
/** How far below the collider the ground probe still counts as grounded. */
const GROUND_PROBE = 0.1;
/** The probe starts this far inside the collider so touching surfaces are hit. */
const PROBE_INSET = 0.05;
/** The core drops the time backlog after this many fixed steps in one frame (see `frame()`). */
const CORE_MAX_SUBSTEPS = 5;

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
  private warnedStatic = false;
  /**
   * Mirror of the core's fixed-step accumulator (time not yet simulated): it
   * gives the fraction of a step to interpolate dynamic bodies by, before the
   * `render` hook (which receives it) runs.
   */
  private acc = 0;
  /** Fixed steps run in the current frame. */
  private steps = 0;

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
    s.rb = rb;
    this.attachCollider(s);
    s.desired.set(0, 0, 0);
    s.lastPos.copy(_p);
    s.lastQuat.copy(_q);
    this.setPose(s, _p, _q);

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

  /** Builds the collider of `s` (with the object's current scale) and attaches it to its body. */
  private attachCollider(s: PhysState) {
    const be = this.backend!;
    const built = buildCollider(be.native!, s.obj, s.area, {
      sensor: isSensorOf(s),
      dynamic: s.kind === "dynamic",
    });
    if (s.body?.mass !== undefined && s.kind === "dynamic") built.desc.setMass(s.body.mass);
    s.collider = be.world!.createCollider(built.desc, s.rb!);
    s.bottom = built.bottom;
    s.scale.copy(s.obj.object3d.scale);
    this.byCollider.set(s.collider.handle, s);
  }

  /**
   * The object's scale changed (`obj.scale.y = 0.5` to crouch, `scaleTo`…): swap its
   * collider for one of the new size. The body keeps its pose and velocity, and
   * contacts that still touch carry over without `collideEnd`/`collide` (a squash
   * animation must not re-fire `onCollide`). A character keeps its feet where they
   * were: crouching does not drop it, standing up does not sink it into the floor.
   */
  private resize(s: PhysState) {
    const oldBottom = s.bottom;
    if (s.collider) {
      this.byCollider.delete(s.collider.handle);
      this.backend!.world!.removeCollider(s.collider, true);
    }
    this.attachCollider(s);
    this.contacts.rekey(s);
    if (s.kind === "character" && s.bottom !== oldBottom) {
      this.worldTransform(s.obj);
      _p.y += s.bottom - oldBottom;
      this.setWorldPosition(s.obj, _p);
      s.rb!.setTranslation(_p, true);
      s.lastPos.copy(_p);
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
    if (this.pending.size > 0) for (const s of [...this.pending]) this.build(s);
    // Only the object's own scale is watched (three compares per object); scaling a
    // parent later does not resize its children's colliders.
    for (const s of this.states.values()) {
      if (s.rb && !s.obj.object3d.scale.equals(s.scale)) this.resize(s);
    }
    for (const s of this.driven) {
      this.worldTransform(s.obj);
      if (_p.equals(s.lastPos) && _q.equals(s.lastQuat)) continue; // the body is already there
      s.rb!.setNextKinematicTranslation(_p);
      s.rb!.setNextKinematicRotation(_q);
      s.lastPos.copy(_p);
      s.lastQuat.copy(_q);
    }
    for (const s of this.dynamics) this.adoptObjectPose(s);
  }

  /**
   * Dynamic body whose object was moved by code since physics last wrote it:
   * teleport the body there (no interpolation across the jump).
   */
  private adoptObjectPose(s: PhysState): boolean {
    this.worldTransform(s.obj);
    if (_p.equals(s.lastPos) && _q.equals(s.lastQuat)) return false;
    s.rb!.setTranslation(_p, true);
    s.rb!.setRotation(_q, true);
    s.lastPos.copy(_p);
    s.lastQuat.copy(_q);
    this.setPose(s, _p, _q);
    return true;
  }

  /** Makes `p`/`q` both the previous and the current pose of a body (nothing to interpolate). */
  private setPose(s: PhysState, p: Vector3, q: Quaternion) {
    s.prevPos.copy(p);
    s.currPos.copy(p);
    s.prevQuat.copy(q);
    s.currQuat.copy(q);
    s.moving = false;
  }

  /** `frameStart`: time that the fixed steps of this frame have to consume. */
  frameStart(dt: number) {
    this.acc += dt;
    this.steps = 0;
  }

  /** `afterFixedUpdate`: step the world, copy bodies back and emit contacts. */
  afterFixed(dt: number) {
    this.acc -= dt;
    this.steps++;
    const be = this.backend;
    if (!be?.ready) return;
    be.step(dt);
    for (const s of this.dynamics) this.writeBack(s);
    be.drainCollisions((h1, h2, started) => {
      if (started) this.contacts.start(h1, h2);
      else this.contacts.end(h1, h2);
    });
    this.contacts.settle();
    this.contacts.update();
    if (this.groundWatch.size > 0) {
      for (const s of [...this.groundWatch]) {
        if (!s.rb || !s.obj.exists()) continue;
        const g = this.probeGround(s);
        if (g && !s.grounded) s.obj.trigger("ground");
        s.grounded = g;
      }
    }
    for (const s of this.forced) s.forced = true; // consumed by this step
  }

  /**
   * `beforeUpdate`: forces applied last frame have been used by the fixed steps,
   * and dynamic bodies are shown at their interpolated pose (so `update` code and
   * the camera, which runs in `afterUpdate`, both see it).
   */
  beforeUpdate(fixedDt: number) {
    for (const s of this.forced) {
      if (!s.forced) continue; // applied after the last step
      s.rb?.resetForces(false);
      s.rb?.resetTorques(false);
      this.forced.delete(s);
      s.forced = false;
    }
    if (!this.backend?.ready) return;
    if (this.steps >= CORE_MAX_SUBSTEPS) this.acc = 0; // the core dropped the backlog
    const alpha = fixedDt > 0 ? Math.min(Math.max(this.acc / fixedDt, 0), 1) : 1;
    for (const s of this.dynamics) {
      if (!s.moving) continue; // already shown at its true pose
      if (this.adoptObjectPose(s)) continue; // code moved it: its value wins
      _ip.lerpVectors(s.prevPos, s.currPos, alpha);
      _iq.slerpQuaternions(s.prevQuat, s.currQuat, alpha);
      this.place(s, _ip, _iq);
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

  /**
   * After a fixed step: records the body's true pose and writes it to the object
   * (so `fixedUpdate` and collision callbacks see it). `beforeUpdate` then replaces
   * it with the interpolated pose for the frame.
   */
  private writeBack(s: PhysState) {
    const rb = s.rb!;
    s.prevPos.copy(s.currPos);
    s.prevQuat.copy(s.currQuat);
    if (rb.isSleeping()) {
      // Nothing moved (prev = curr): settle on the true pose once, then leave the object alone.
      if (s.moving) {
        s.moving = false;
        this.place(s, s.currPos, s.currQuat);
      }
      return;
    }
    const t = rb.translation();
    const r = rb.rotation();
    s.currPos.set(t.x, t.y, t.z);
    s.currQuat.set(r.x, r.y, r.z, r.w);
    if (s.body?.interpolate === false) {
      s.prevPos.copy(s.currPos);
      s.prevQuat.copy(s.currQuat);
    }
    s.moving = !s.prevPos.equals(s.currPos) || !s.prevQuat.equals(s.currQuat);
    this.place(s, s.currPos, s.currQuat);
  }

  /** Writes a world pose to the object (converted to local space) and remembers it. */
  private place(s: PhysState, p: Vector3, q: Quaternion) {
    const node = s.obj.object3d;
    _wp.copy(p);
    _wq.copy(q);
    const parent = node.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(_wp);
      parent.getWorldQuaternion(_pq).invert();
      _wq.premultiply(_pq);
    }
    node.position.copy(_wp);
    node.quaternion.copy(_wq);
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

  /**
   * Queues a horizontal displacement for the character's next step. The vertical
   * part is dropped: height comes from gravity and `jump()`, so a `moveTo()` towards
   * a target at another height does not push the character into the ground.
   */
  moveCharacter(s: PhysState, delta: Vector3) {
    s.desired.x += delta.x;
    s.desired.z += delta.z;
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

  /**
   * `move()` on a body: dynamic bodies get the horizontal velocity, kinematic ones are
   * translated. Static bodies don't move (their collider would stay behind): warns once.
   */
  moveBody(s: PhysState, delta: Vector3, velocity: Vector3) {
    if (s.body?.isStatic) {
      if (!this.warnedStatic) {
        this.warnedStatic = true;
        console.warn(
          "[threeplay] move() on a body({ isStatic: true }) does nothing: its collider can't follow. Use body({ kinematic: true }) for moving platforms.",
        );
      }
      return;
    }
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
    this.setPose(s, _p, _q);
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
