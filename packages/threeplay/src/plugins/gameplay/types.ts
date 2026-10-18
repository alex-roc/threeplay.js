import type { Easing } from "../../core/math";
import type { Comp, EventController, TimerController, Tweenable } from "../../core/types";

/** Fields added by `health()`. */
export interface HealthComp extends Comp {
  id: "health";
  hp: number;
  maxHp: number;
  hurt(amount?: number): void;
  heal(amount?: number): void;
  setHP(hp: number): void;
  onHurt(fn: (amount: number) => void): EventController;
  onHeal(fn: (amount: number) => void): EventController;
  /** When hp reaches 0 (fires once until healed again). */
  onDeath(fn: () => void): EventController;
}

/** Fields added by `state()`: a small finite state machine. */
export interface StateComp extends Comp {
  id: "state";
  state: string;
  enterState(name: string, ...args: unknown[]): void;
  onStateEnter(name: string, fn: (...args: any[]) => void): EventController;
  onStateEnd(name: string, fn: () => void): EventController;
  onStateUpdate(name: string, fn: () => void): EventController;
}

/** Fields added by `lifespan()`. */
export interface LifespanComp extends Comp {
  id: "lifespan";
}

/** Fields added by `timer()`: timers that die with the object. */
export interface TimerComp extends Comp {
  id: "timer";
  wait(seconds: number, fn?: () => void): TimerController;
  loop(seconds: number, fn: () => void, count?: number): TimerController;
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
  /** Also count objects outside the camera frustum (default `false`). */
  frustum?: boolean;
}

/** Fields added by `offscreen()`. */
export interface OffscreenComp extends Comp {
  id: "offscreen";
  isOffScreen(): boolean;
  onExitScreen(fn: () => void): EventController;
  onEnterScreen(fn: () => void): EventController;
}

/** API of the gameplay plugin: common game-logic components. */
export interface GameplayAPI {
  health(hp: number, maxHp?: number): HealthComp;
  state(initial: string, allowed?: string[]): StateComp;
  /** Destroys the object after `seconds` (fading out the last `fade` seconds if it has `opacity`). */
  lifespan(seconds: number, opts?: { fade?: number }): LifespanComp;
  timer(): TimerComp;
  offscreen(opts?: OffscreenOpts): OffscreenComp;
}

declare module "../../core/types" {
  interface PluginRegistry {
    gameplay: GameplayAPI;
  }
}
