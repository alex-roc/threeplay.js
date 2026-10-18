import type * as THREE from "three";
import type { EventController, GameObj, Tag } from "../../core/types";

/**
 * Key names, kaplay style: letters and digits as typed (`"a"`, `"1"`), plus
 * `"left" "right" "up" "down" "space" "enter" "escape" "backspace" "tab"
 * "shift" "control" "alt" "meta" "f1"…"f12"`. Matching is case-insensitive.
 */
export type Key = string;

export type MouseButton = "left" | "right" | "middle" | "back" | "forward";

/**
 * Gamepad buttons (standard mapping): `"south" "east" "west" "north"
 * "lshoulder" "rshoulder" "ltrigger" "rtrigger" "select" "start" "lstick"
 * "rstick" "dpad-up" "dpad-down" "dpad-left" "dpad-right" "home"`.
 */
export type GamepadButton = string;

/** One virtual button and the physical inputs that press it. */
export interface ButtonBinding {
  keyboard?: Key | Key[];
  mouse?: MouseButton | MouseButton[];
  gamepad?: GamepadButton | GamepadButton[];
}

/** Options added to `threeplay()` by the input plugin. */
export interface InputOpts {
  /** Virtual buttons: `{ jump: { keyboard: ["space", "w"], gamepad: "south" } }`. */
  buttons?: Record<string, ButtonBinding>;
}

/** Options of `inputDir()`. */
export interface InputDirOpts {
  /**
   * `"camera"` (default) makes "forward" point where the camera looks, on the
   * XZ plane; `"world"` maps forward to −Z.
   */
  relativeTo?: "camera" | "world";
}

/** API of the input plugin. Listeners registered in a scene die with it. */
export interface InputAPI {
  // keyboard
  isKeyDown(key: Key | Key[]): boolean;
  isKeyPressed(key?: Key | Key[]): boolean;
  isKeyReleased(key?: Key | Key[]): boolean;
  onKeyDown(key: Key | Key[], fn: (key: Key) => void): EventController;
  onKeyDown(fn: (key: Key) => void): EventController;
  onKeyPress(key: Key | Key[], fn: (key: Key) => void): EventController;
  onKeyPress(fn: (key: Key) => void): EventController;
  /** Like `onKeyPress` but repeats while held (OS key repeat). */
  onKeyPressRepeat(key: Key | Key[], fn: (key: Key) => void): EventController;
  onKeyPressRepeat(fn: (key: Key) => void): EventController;
  onKeyRelease(key: Key | Key[], fn: (key: Key) => void): EventController;
  onKeyRelease(fn: (key: Key) => void): EventController;
  /** Typed characters (for text entry). */
  onCharInput(fn: (ch: string) => void): EventController;

  // virtual buttons (keyboard, mouse, gamepad and touch UIs all press these)
  isButtonDown(btn: string | string[]): boolean;
  isButtonPressed(btn?: string | string[]): boolean;
  isButtonReleased(btn?: string | string[]): boolean;
  onButtonDown(btn: string | string[], fn: (btn: string) => void): EventController;
  onButtonDown(fn: (btn: string) => void): EventController;
  onButtonPress(btn: string | string[], fn: (btn: string) => void): EventController;
  onButtonPress(fn: (btn: string) => void): EventController;
  onButtonRelease(btn: string | string[], fn: (btn: string) => void): EventController;
  onButtonRelease(fn: (btn: string) => void): EventController;
  /** Presses a virtual button from code (on-screen controls, bots, tests). */
  pressButton(btn: string): void;
  releaseButton(btn: string): void;
  getButton(btn: string): ButtonBinding | undefined;
  setButton(btn: string, binding: ButtonBinding): void;

  // mouse
  /** Mouse position in logical screen coordinates. */
  mousePos(): THREE.Vector2;
  /** Mouse movement since the last frame (works while the pointer is locked). */
  mouseDeltaPos(): THREE.Vector2;
  isMouseDown(btn?: MouseButton): boolean;
  isMousePressed(btn?: MouseButton): boolean;
  isMouseReleased(btn?: MouseButton): boolean;
  onMousePress(btn: MouseButton, fn: (pos: THREE.Vector2) => void): EventController;
  onMousePress(fn: (pos: THREE.Vector2) => void): EventController;
  onMouseRelease(btn: MouseButton, fn: (pos: THREE.Vector2) => void): EventController;
  onMouseRelease(fn: (pos: THREE.Vector2) => void): EventController;
  onMouseMove(fn: (pos: THREE.Vector2, delta: THREE.Vector2) => void): EventController;
  onScroll(fn: (delta: THREE.Vector2) => void): EventController;
  /** Locks the pointer to the canvas (first-person controls). Needs a user gesture. */
  lockPointer(): void;
  unlockPointer(): void;
  isPointerLocked(): boolean;
  /** Clicks on objects with `tag` (raycast against their meshes). */
  onClick(tag: Tag, fn: (obj: GameObj) => void): EventController;
  /** Clicks anywhere. */
  onClick(fn: () => void): EventController;
  onHover(tag: Tag, fn: (obj: GameObj) => void): EventController;
  onHoverEnd(tag: Tag, fn: (obj: GameObj) => void): EventController;

  // touch
  onTouchStart(fn: (pos: THREE.Vector2, touch: Touch) => void): EventController;
  onTouchMove(fn: (pos: THREE.Vector2, touch: Touch) => void): EventController;
  onTouchEnd(fn: (pos: THREE.Vector2, touch: Touch) => void): EventController;
  isTouchscreen(): boolean;

  // gamepad
  /** Stick position, each axis −1…1, with a dead zone. */
  getGamepadStick(stick: "left" | "right"): THREE.Vector2;
  isGamepadButtonDown(btn: GamepadButton): boolean;
  onGamepadButtonPress(btn: GamepadButton, fn: (btn: GamepadButton) => void): EventController;
  onGamepadButtonPress(fn: (btn: GamepadButton) => void): EventController;
  onGamepadConnect(fn: (pad: Gamepad) => void): EventController;

  /**
   * Movement direction from four virtual buttons (and the left stick), as a
   * unit (or zero) vector on the XZ plane. Default buttons:
   * `"left" "right" "up" "down"`.
   */
  inputDir(
    left?: string,
    right?: string,
    forward?: string,
    back?: string,
    opts?: InputDirOpts,
  ): THREE.Vector3;
}

declare module "../../core/types" {
  interface PluginRegistry {
    input: InputAPI;
  }
  interface ThreeplayOpts extends InputOpts {}
}
