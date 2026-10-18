import type { Collider, KinematicCharacterController, RigidBody } from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import type { GameObj } from "../../core/types";
import type { AreaOpts, BodyOpts, CharacterOpts, Collision } from "./types";

/** What kind of Rapier body an object gets, derived from its components. */
export type BodyKind = "area" | "static" | "kinematic" | "dynamic" | "character";

/** A pair of touching objects (both directions of one contact). */
export interface Pair {
  key: string;
  a: PhysState;
  b: PhysState;
  /** The contact as seen from `a` (its `other` is `b`). */
  colA: Collision;
  /** The contact as seen from `b`. */
  colB: Collision;
}

/** Everything the physics plugin knows about one game object. */
export interface PhysState {
  obj: GameObj;
  area: AreaOpts;
  body: BodyOpts | null;
  character: CharacterOpts | null;
  kind: BodyKind;
  rb: RigidBody | null;
  collider: Collider | null;
  controller: KinematicCharacterController | null;
  /** Objects currently touching this one. */
  touching: Map<GameObj, Collision>;
  pairs: Set<Pair>;
  /** Linear velocity: the character's own, or a stand-in until the body exists. */
  vel: Vector3;
  /** Angular velocity (degrees/s) stand-in until the body exists. */
  angVel: Vector3;
  /** Live views over the rigid body (`body()` only); created lazily. */
  liveVel: Vector3 | null;
  liveAng: Vector3 | null;
  /** Character: displacement requested through `move()` this frame. */
  desired: Vector3;
  grounded: boolean;
  /** Distance from the body origin down to the bottom of the collider. */
  bottom: number;
  /** World transform physics last wrote to (or read from) the object. */
  lastPos: Vector3;
  lastQuat: Quaternion;
  /** `applyForce` was used and the fixed steps have not consumed it yet. */
  forced: boolean;
}

/** Creates the state of an object that just got its first physics component. */
export function createState(obj: GameObj): PhysState {
  return {
    obj,
    area: {},
    body: null,
    character: null,
    kind: "area",
    rb: null,
    collider: null,
    controller: null,
    touching: new Map(),
    pairs: new Set(),
    vel: new Vector3(),
    angVel: new Vector3(),
    liveVel: null,
    liveAng: null,
    desired: new Vector3(),
    grounded: false,
    bottom: 0,
    lastPos: new Vector3(Number.NaN, 0, 0),
    lastQuat: new Quaternion(),
    forced: false,
  };
}

/** The body kind an object's components ask for. */
export function kindOf(s: PhysState): BodyKind {
  if (s.character) return "character";
  if (s.body) return s.body.isStatic ? "static" : s.body.kinematic ? "kinematic" : "dynamic";
  return "area";
}

/** Whether the collider is a sensor: explicit option, else only without a body. */
export function isSensorOf(s: PhysState): boolean {
  return s.area.sensor ?? !(s.body || s.character);
}
