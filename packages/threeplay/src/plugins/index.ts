import type { PluginLike } from "../core/types";
import { assetsPlugin } from "./assets";
import { audioPlugin } from "./audio";
import { cameraPlugin } from "./camera";
import { debugPlugin } from "./debug";
import { gameplayPlugin } from "./gameplay";
import { hudPlugin } from "./hud";
import { inputPlugin } from "./input";
import { levelPlugin } from "./level";
import { physicsPlugin } from "./physics";
import { renderPlugin } from "./render";
import { shapesPlugin } from "./shapes";
import { transformPlugin } from "./transform";

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
  inputPlugin,
  cameraPlugin,
  physicsPlugin,
  hudPlugin,
  assetsPlugin,
  audioPlugin,
  levelPlugin,
  gameplayPlugin,
  debugPlugin,
];
