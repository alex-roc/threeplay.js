import type { PluginLike } from "../core/types.js";
import { assetsPlugin } from "./assets/index.js";
import { audioPlugin } from "./audio/index.js";
import { cameraPlugin } from "./camera/index.js";
import { debugPlugin } from "./debug/index.js";
import { gameplayPlugin } from "./gameplay/index.js";
import { hudPlugin } from "./hud/index.js";
import { inputPlugin } from "./input/index.js";
import { levelPlugin } from "./level/index.js";
import { physicsPlugin } from "./physics/index.js";
import { renderPlugin } from "./render/index.js";
import { shapesPlugin } from "./shapes/index.js";
import { transformPlugin } from "./transform/index.js";

export {
  assetsPlugin,
  audioPlugin,
  cameraPlugin,
  debugPlugin,
  gameplayPlugin,
  hudPlugin,
  inputPlugin,
  levelPlugin,
  physicsPlugin,
  renderPlugin,
  shapesPlugin,
  transformPlugin,
};

/**
 * Built-in plugins, in install order. Each one only uses the public plugin
 * API, so any of them can be left out or replaced with `threeplay({ core: [...] })`.
 */
export const defaultPlugins: PluginLike[] = [
  renderPlugin,
  transformPlugin,
  shapesPlugin,
  physicsPlugin,
  inputPlugin,
  cameraPlugin,
  hudPlugin,
  assetsPlugin,
  audioPlugin,
  levelPlugin,
  gameplayPlugin,
  debugPlugin,
];
