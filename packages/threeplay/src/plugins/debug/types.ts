import type { GameObj } from "../../core/types.js";

/** Options added to `threeplay()` by the debug plugin. */
export interface DebugOpts {
  /**
   * Key that toggles the inspector (default `"f1"`; `false` disables it). Needs the input
   * plugin (an optional dependency: without it the key does nothing). The browser default of
   * the key is prevented while the canvas has focus (F1 would open help on Windows).
   */
  debugKey?: string | false;
  /** Start with the inspector on. */
  debug?: boolean;
}

/** The `debug` object (`k.debug`). Without a render overlay (headless) only the data API works. */
export interface Debug {
  /**
   * Shows the inspector: FPS, object count, renderer info and the components
   * of the object under the mouse, plus colliders (physics) or bounding boxes.
   * Setting it emits the `debugInspect` hook. The `debugKey` toggles it.
   */
  inspect: boolean;
  /** Pauses the game (rendering continues). */
  paused: boolean;
  /** Game speed multiplier. */
  timeScale: number;
  /** Frames per second (smoothed). */
  fps(): number;
  /** Number of live objects. */
  objectCount(): number;
  /** Prints a message on screen (it fades after ~4 s) and in the console. */
  log(...msg: unknown[]): void;
  /** Like `log`, in red, and through `console.error`. */
  error(...msg: unknown[]): void;
  /** Clears on-screen messages. */
  clearLog(): void;
  /** The object under the mouse (nearest visible hit), or `null` (also when there is no input or render). */
  hovered(): GameObj | null;
}

/** API of the debug plugin. */
export interface DebugAPI {
  /** Debug tools. */
  debug: Debug;
}

declare module "../../core/types.js" {
  interface PluginRegistry {
    debug: DebugAPI;
  }
  interface ThreeplayOpts extends DebugOpts {}
  interface EngineHooks {
    /** The inspector was turned on or off (physics draws colliders while on). */
    debugInspect: [enabled: boolean];
  }
}
