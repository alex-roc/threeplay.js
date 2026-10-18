import type { Vector3 } from "three";
import type { Pair, PhysState } from "./state.js";
import type { Collision } from "./types.js";

/** What the tracker needs from the physics system. */
export interface ContactSource {
  /** State of the object owning a collider handle. */
  stateOf(handle: number): PhysState | undefined;
  /** Contact normal pointing from `a` to `b`, if the pair has contact points. */
  normalBetween(a: PhysState, b: PhysState): Vector3 | null;
}

/**
 * Turns Rapier's start/stop collision events into object events:
 * `collide`, `collideUpdate` (every fixed step while touching) and `collideEnd`.
 */
export class ContactTracker {
  private readonly pairs = new Map<string, Pair>();

  constructor(private readonly source: ContactSource) {}

  /** A collision started between two colliders. */
  start(h1: number, h2: number) {
    const a = this.source.stateOf(h1);
    const b = this.source.stateOf(h2);
    if (!a || !b || a === b) return;
    const key = h1 < h2 ? `${h1}:${h2}` : `${h2}:${h1}`;
    if (this.pairs.has(key)) return;
    const sensor = !!(a.collider?.isSensor() || b.collider?.isSensor());
    const n = sensor ? null : this.source.normalBetween(a, b);
    // Normals point from the other object to this one.
    const colA: Collision = { other: b.obj, sensor, normal: n ? n.clone().negate() : null };
    const colB: Collision = { other: a.obj, sensor, normal: n };
    const pair: Pair = { key, a, b, colA, colB };
    this.pairs.set(key, pair);
    a.pairs.add(pair);
    b.pairs.add(pair);
    a.touching.set(b.obj, colA);
    b.touching.set(a.obj, colB);
    a.obj.trigger("collide", b.obj, colA);
    b.obj.trigger("collide", a.obj, colB);
  }

  /** A collision ended between two colliders. */
  end(h1: number, h2: number) {
    const key = h1 < h2 ? `${h1}:${h2}` : `${h2}:${h1}`;
    const pair = this.pairs.get(key);
    if (pair) this.finish(pair, true, true);
  }

  /** Emits `collideUpdate` for every active pair. */
  update() {
    for (const p of [...this.pairs.values()]) {
      if (!this.pairs.has(p.key)) continue; // ended by a handler
      p.a.obj.trigger("collideUpdate", p.b.obj, p.colA);
      if (!this.pairs.has(p.key)) continue;
      p.b.obj.trigger("collideUpdate", p.a.obj, p.colB);
    }
  }

  /**
   * Ends every contact of `s` (its collider is going away). With `notifySelf`
   * `s` gets `collideEnd` too; the objects it touched always do.
   */
  endAll(s: PhysState, notifySelf: boolean) {
    for (const p of [...s.pairs]) this.finish(p, p.a !== s || notifySelf, p.b !== s || notifySelf);
  }

  private finish(pair: Pair, notifyA: boolean, notifyB: boolean) {
    this.pairs.delete(pair.key);
    pair.a.pairs.delete(pair);
    pair.b.pairs.delete(pair);
    pair.a.touching.delete(pair.b.obj);
    pair.b.touching.delete(pair.a.obj);
    if (notifyA) pair.a.obj.trigger("collideEnd", pair.b.obj);
    if (notifyB) pair.b.obj.trigger("collideEnd", pair.a.obj);
  }
}
