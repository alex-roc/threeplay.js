import type { EventQueue, World } from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import type { PhysicsBackend } from "./types.js";

/** The Rapier module (`import("@dimforge/rapier3d-compat")`). */
export type Rapier = typeof import("@dimforge/rapier3d-compat");

/**
 * The built-in {@link PhysicsBackend}: a Rapier world and its event queue.
 * Rapier is loaded with a dynamic `import()` in {@link RapierBackend.init},
 * so bundlers put it in its own chunk and it is only downloaded when physics is on.
 */
export class RapierBackend implements PhysicsBackend {
  readonly name = "rapier";
  /** The Rapier module, once loaded. */
  native: Rapier | null = null;
  /** The Rapier world, once loaded. */
  world: World | null = null;
  private events: EventQueue | null = null;
  private readonly gravity = new Vector3(0, -20, 0);

  get ready() {
    return this.world !== null;
  }

  async init() {
    if (this.world) return;
    const mod = await import("@dimforge/rapier3d-compat");
    // Node loads the CJS build, where the API sits under `default`.
    const R = ((mod as any).init ? mod : (mod as any).default) as Rapier;
    await R.init();
    this.native = R;
    this.world = new R.World({ x: this.gravity.x, y: this.gravity.y, z: this.gravity.z });
    this.events = new R.EventQueue(true);
  }

  setGravity(g: Vector3) {
    this.gravity.copy(g);
    if (!this.world) return;
    this.world.gravity = { x: g.x, y: g.y, z: g.z };
    // Sleeping bodies would ignore the new gravity until something touches them.
    this.world.forEachRigidBody((rb) => rb.wakeUp());
  }

  getGravity() {
    return this.gravity.clone();
  }

  step(dt: number) {
    if (!this.world || !this.events) return;
    this.world.timestep = dt;
    this.world.step(this.events);
  }

  /** Calls `fn` for every collision started/ended during the last step. */
  drainCollisions(fn: (handle1: number, handle2: number, started: boolean) => void) {
    this.events?.drainCollisionEvents(fn);
  }

  dispose() {
    this.events?.free();
    this.world?.free();
    this.events = null;
    this.world = null;
  }
}
