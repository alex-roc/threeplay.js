import { createEngine } from "./core/engine.js";
import type { Engine, PluginLike, ThreeplayOpts } from "./core/types.js";
import { installGlobals } from "./globals.js";

export { globalKeys, installGlobals } from "./globals.js";

import { defaultPlugins } from "./plugins/index.js";

/** Options of {@link threeplay}. */
export interface ThreeplayInit extends ThreeplayOpts {
  /**
   * Replaces the built-in plugin set. Leave it out to get every built-in
   * plugin; pass a subset to build a smaller engine.
   */
  core?: PluginLike[];
}

/**
 * Creates a game.
 *
 * ```js
 * import threeplay from "threeplay";
 * threeplay({ background: "#87ceeb" });
 * add([box(1, 1, 1), pos(0, 0.5, 0), color("tomato")]);
 * ```
 */
export function threeplay(opts: ThreeplayInit = {}): Engine {
  const plugins = [...(opts.core ?? defaultPlugins), ...(opts.plugins ?? [])];
  const k = createEngine(opts, plugins);
  if (opts.global ?? true) k.onQuit(installGlobals(k));
  return k;
}

export default threeplay;

export type { HookFn } from "./core/engine.js";
export { createEngine, definePlugin, joinControllers } from "./core/engine.js";
export { EventEmitter, HandlerList, Scope } from "./core/events.js";
export { GameObjImpl } from "./core/gameobj.js";
export * from "./core/math.js";
export type * from "./core/types.js";
export * from "./core/util.js";
export type * from "./plugins/assets/types.js";
export type * from "./plugins/audio/types.js";
export type * from "./plugins/camera/types.js";
export type * from "./plugins/debug/types.js";
export type * from "./plugins/gameplay/types.js";
export type * from "./plugins/hud/types.js";
export * from "./plugins/index.js";
export type * from "./plugins/input/types.js";
export type * from "./plugins/level/types.js";
export type * from "./plugins/physics/types.js";
export type * from "./plugins/render/types.js";
export type * from "./plugins/shapes/types.js";
export type * from "./plugins/transform/types.js";
