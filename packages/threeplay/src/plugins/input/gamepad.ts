import { Vector2 } from "three";
import { GAMEPAD_BUTTONS } from "./keys";
import type { GamepadButton } from "./types";

/** Radial dead zone of the sticks. */
export const STICK_DEAD_ZONE = 0.15;

/**
 * Applies a radial dead zone: inside it the stick reads zero, outside it the
 * remaining range is stretched back to 0…1 so there is no jump at the edge.
 */
export function applyDeadZone(x: number, y: number, deadZone = STICK_DEAD_ZONE): Vector2 {
  const len = Math.hypot(x, y);
  if (len < deadZone) return new Vector2();
  const scaled = Math.min((len - deadZone) / (1 - deadZone), 1);
  return new Vector2((x / len) * scaled, (y / len) * scaled);
}

/** The slice of a `Gamepad` that {@link readGamepads} needs. */
export interface GamepadLike {
  connected: boolean;
  buttons: ReadonlyArray<{ pressed: boolean }>;
  axes: ReadonlyArray<number>;
}

/** A snapshot of every connected gamepad, merged. */
export interface GamepadSnapshot {
  /** Names of the buttons held on any pad. */
  down: Set<GamepadButton>;
  /** First non-neutral left stick (y grows downwards, like the Gamepad API). */
  left: Vector2;
  /** First non-neutral right stick. */
  right: Vector2;
}

/** Merges the connected pads: buttons are OR-ed, sticks come from the first pad that moves one. */
export function readGamepads(pads: ReadonlyArray<GamepadLike | null | undefined>): GamepadSnapshot {
  const snap: GamepadSnapshot = { down: new Set(), left: new Vector2(), right: new Vector2() };
  for (const pad of pads) {
    if (!pad?.connected) continue;
    pad.buttons.forEach((b, i) => {
      const name = GAMEPAD_BUTTONS[i];
      if (name && b.pressed) snap.down.add(name);
    });
    if (snap.left.lengthSq() === 0) snap.left = applyDeadZone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    if (snap.right.lengthSq() === 0) snap.right = applyDeadZone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
  }
  return snap;
}
