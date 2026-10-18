import { normalizeKey, toList } from "./keys";
import type { ButtonBinding, GamepadButton, Key, MouseButton } from "./types";

/**
 * The down / pressed / released state machine behind keys, mouse buttons,
 * gamepad buttons and virtual buttons. `pressed` and `released` hold what
 * happened this frame; call {@link PressState.endFrame} once per frame. A press
 * and a release in the same frame leave the input in both sets (and not down).
 */
export class PressState<T = string> {
  /** Currently held. */
  readonly down = new Set<T>();
  /** Went down this frame. */
  readonly pressed = new Set<T>();
  /** Went up this frame. */
  readonly released = new Set<T>();

  /** Marks `x` as down. Returns `false` if it already was (nothing happens). */
  press(x: T): boolean {
    if (this.down.has(x)) return false;
    this.down.add(x);
    this.pressed.add(x);
    return true;
  }

  /** Marks `x` as up. Returns `false` if it was not down. */
  release(x: T): boolean {
    if (!this.down.delete(x)) return false;
    this.released.add(x);
    return true;
  }

  /** Releases everything held; returns what was released. */
  releaseAll(): T[] {
    const all = [...this.down];
    for (const x of all) this.release(x);
    return all;
  }

  /** Clears `pressed` and `released`. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}

/** `true` if any of the wanted inputs is in `set` (any input at all when none is given). */
export function hasAny<T>(set: ReadonlySet<T>, wanted?: T | readonly T[]): boolean {
  if (wanted === undefined) return set.size > 0;
  return toList(wanted).some((x) => set.has(x));
}

/** Where physical button states come from, for {@link isBindingDown}. */
export interface ButtonSources {
  keyDown(key: Key): boolean;
  mouseDown(btn: MouseButton): boolean;
  padDown(btn: GamepadButton): boolean;
}

/** `true` if any physical input of the binding is down. */
export function isBindingDown(binding: ButtonBinding, src: ButtonSources): boolean {
  return (
    toList(binding.keyboard).some((key) => src.keyDown(normalizeKey(key))) ||
    toList(binding.mouse).some((btn) => src.mouseDown(btn)) ||
    toList(binding.gamepad).some((btn) => src.padDown(btn))
  );
}
