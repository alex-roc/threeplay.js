import { createEngine } from "./core/engine";
import type { Engine, PluginLike, ThreeplayOpts } from "./core/types";
import { installGlobals } from "./globals";

export { globalKeys, installGlobals } from "./globals";
import { defaultPlugins } from "./plugins";

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
  if (opts.global ?? true) installGlobals(k);
  return k;
}

export default threeplay;

export type { HookFn } from "./core/engine";
export { createEngine, definePlugin, joinControllers } from "./core/engine";
export { EventEmitter, HandlerList, Scope } from "./core/events";
export { GameObjImpl } from "./core/gameobj";
export * from "./core/math";
export type * from "./core/types";
export * from "./core/util";
export * from "./plugins";
export type * from "./plugins/assets/types";
export type * from "./plugins/audio/types";
export type * from "./plugins/camera/types";
export type * from "./plugins/debug/types";
export type * from "./plugins/gameplay/types";
export type * from "./plugins/hud/types";
export type * from "./plugins/input/types";
export type * from "./plugins/level/types";
export type * from "./plugins/physics/types";
export type * from "./plugins/render/types";
export type * from "./plugins/shapes/types";
export type * from "./plugins/transform/types";
