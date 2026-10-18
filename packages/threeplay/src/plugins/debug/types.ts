/** Options added to `threeplay()` by the debug plugin. */
export interface DebugOpts {
  /** Key that toggles the inspector (default `"f1"`; `false` disables it). */
  debugKey?: string | false;
  /** Start with the inspector on. */
  debug?: boolean;
}

/** The `debug` object. */
export interface Debug {
  /** Shows colliders, FPS, object count and the inspected object's components. */
  inspect: boolean;
  /** Pauses the game (rendering continues). */
  paused: boolean;
  /** Game speed multiplier. */
  timeScale: number;
  /** Frames per second (smoothed). */
  fps(): number;
  /** Number of live objects. */
  objectCount(): number;
  /** Prints a message on screen (and in the console). */
  log(...msg: unknown[]): void;
  error(...msg: unknown[]): void;
  /** Clears on-screen messages. */
  clearLog(): void;
}

/** API of the debug plugin. */
export interface DebugAPI {
  debug: Debug;
}

declare module "../../core/types" {
  interface PluginRegistry {
    debug: DebugAPI;
  }
  interface ThreeplayOpts extends DebugOpts {}
  interface EngineHooks {
    /** The inspector was turned on or off (physics draws colliders while on). */
    debugInspect: [enabled: boolean];
  }
}
