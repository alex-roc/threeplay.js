import type { Easing } from "../../core/math";
import type { Comp, EventController, TimerController, Tweenable } from "../../core/types";

/**
 * Fields added by `health()`. Events are object events: `"hurt"` (amount),
 * `"heal"` (amount) and `"death"`, also reachable with `k.on("death", tag, fn)`.
 */
export interface HealthComp extends Comp {
  id: "health";
  /**
   * Current hit points, always within 0…`maxHp`. Assigning to it
   * (`obj.hp -= 1`) behaves like {@link HealthComp.setHP}.
   */
  hp: number;
  /** Upper limit of `hp` and of `heal()`. */
  maxHp: number;
  /** Removes hit points (default 1), emits `"hurt"`, then `"death"` if hp reached 0. */
  hurt(amount?: number): void;
  /** Adds hit points (default 1, clamped to `maxHp`) and emits `"heal"`. */
  heal(amount?: number): void;
  /** Sets hp (clamped to 0…`maxHp`) without hurt/heal events; emits `"death"` at 0. */
  setHP(hp: number): void;
  /** Runs after every `hurt()`. */
  onHurt(fn: (amount: number) => void): EventController;
  /** Runs after every `heal()`. */
  onHeal(fn: (amount: number) => void): EventController;
  /** When hp reaches 0 (fires once until hp is above 0 again). */
  onDeath(fn: () => void): EventController;
}

/** Fields added by `state()`: a small finite state machine. */
export interface StateComp extends Comp {
  id: "state";
  /** Name of the current state. Assigning to it calls `enterState`. */
  state: string;
  /** Leaves the current state (running its `onStateEnd` handlers) and enters `name`, passing `args` to its enter handlers. Throws for names outside `allowed`. */
  enterState(name: string, ...args: unknown[]): void;
  /**
   * Runs when `name` is entered. The initial state is entered on the first
   * frame, so handlers registered right after `add([...])` still see it.
   */
  onStateEnter(name: string, fn: (...args: any[]) => void): EventController;
  /** Runs when `name` is left. */
  onStateEnd(name: string, fn: () => void): EventController;
  /** Runs every frame while `name` is the current state (not while the object is paused). */
  onStateUpdate(name: string, fn: () => void): EventController;
}

/** Fields added by `lifespan()`. */
export interface LifespanComp extends Comp {
  id: "lifespan";
}

/**
 * Fields added by `timer()`: timers bound to the object. They tick in its own
 * update (so `obj.paused` stops them) and die with it.
 */
export interface TimerComp extends Comp {
  id: "timer";
  /** Runs `fn` after `seconds`. Awaitable. */
  wait(seconds: number, fn?: () => void): TimerController;
  /** Runs `fn` right away and then every `seconds`, `count` times or forever. */
  loop(seconds: number, fn: () => void, count?: number): TimerController;
  /** Animates a value from `from` to `to`, calling `set` each frame. */
  tween<V extends Tweenable>(
    from: V,
    to: V,
    duration: number,
    set: (v: V) => void,
    easing?: Easing,
  ): TimerController;
}

/** Options of `offscreen()`. */
export interface OffscreenOpts {
  /** Distance from the camera beyond which the object counts as offscreen (default 100). */
  distance?: number;
  /** Destroy it when offscreen (default `false`). */
  destroy?: boolean;
  /** Also count objects outside the camera frustum (default `false`; uses `mesh`'s bounds if it has one). */
  frustum?: boolean;
}

/**
 * Fields added by `offscreen()`. Emits the object events `"exitScreen"` and
 * `"enterScreen"`. An object that starts offscreen emits `"exitScreen"` on its
 * first frame.
 */
export interface OffscreenComp extends Comp {
  id: "offscreen";
  /** `true` while the object is offscreen (as of the last frame). */
  isOffScreen(): boolean;
  /** Runs when the object goes offscreen. */
  onExitScreen(fn: () => void): EventController;
  /** Runs when the object comes back on screen. */
  onEnterScreen(fn: () => void): EventController;
}

/** API of the gameplay plugin: common game-logic components. */
export interface GameplayAPI {
  /** Component: hit points, `hurt`/`heal` and `"hurt"`/`"heal"`/`"death"` events. */
  health(hp: number, maxHp?: number): HealthComp;
  /** Component: a state machine starting in `initial`; `allowed` (optional) restricts the names. */
  state(initial: string, allowed?: string[]): StateComp;
  /** Destroys the object after `seconds` (fading out the last `fade` seconds if it has `opacity`). */
  lifespan(seconds: number, opts?: { fade?: number }): LifespanComp;
  /** Component: timers that tick and die with the object. */
  timer(): TimerComp;
  /** Component: detects when the object is far from the camera (or outside its view). */
  offscreen(opts?: OffscreenOpts): OffscreenComp;
}

declare module "../../core/types" {
  interface PluginRegistry {
    gameplay: GameplayAPI;
  }
}
