import type * as THREE from "three";
import type { EventController, GameObj, Tag } from "../../core/types.js";

/**
 * Key names, kaplay style: letters and digits as typed (`"a"`, `"1"`), plus
 * `"left" "right" "up" "down" "space" "enter" "escape" "backspace" "tab"
 * "shift" "control" "alt" "meta" "f1"…"f12"`. Matching is case-insensitive.
 */
export type Key = string;

/** Mouse button names. */
export type MouseButton = "left" | "right" | "middle" | "back" | "forward";

/**
 * Gamepad buttons (standard mapping): `"south" "east" "west" "north"
 * "lshoulder" "rshoulder" "ltrigger" "rtrigger" "select" "start" "lstick"
 * "rstick" "dpad-up" "dpad-down" "dpad-left" "dpad-right" "home"`.
 */
export type GamepadButton = string;

/** One virtual button and the physical inputs that press it. */
export interface ButtonBinding {
  /** Keyboard keys (any of them presses the button). */
  keyboard?: Key | Key[];
  /** Mouse buttons. */
  mouse?: MouseButton | MouseButton[];
  /** Gamepad buttons (standard mapping names). */
  gamepad?: GamepadButton | GamepadButton[];
}

/** Options added to `threeplay()` by the input plugin. */
export interface InputOpts {
  /**
   * Virtual buttons: `{ jump: { keyboard: ["space", "w"], gamepad: "south" } }`.
   * Merged over the defaults, which exist even if you pass nothing:
   * `left` (arrows, A), `right` (arrows, D), `up` (arrows, W), `down` (arrows, S)
   * and `jump` (space), each with its d-pad / south gamepad button. Redefining
   * a name replaces its default binding entirely.
   */
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

/**
 * API of the input plugin. Listeners registered in a scene die with it.
 * Input is sampled at the start of each frame: `isKeyPressed` & co. are true
 * for the whole frame in which the key went down.
 */
export interface InputAPI {
  // keyboard
  /** `true` while any of the keys is held. */
  isKeyDown(key: Key | Key[]): boolean;
  /** `true` the frame a key went down (any key when called without arguments). */
  isKeyPressed(key?: Key | Key[]): boolean;
  /** `true` the frame a key went up (any key when called without arguments). */
  isKeyReleased(key?: Key | Key[]): boolean;
  /** Runs every frame while a key (or any key) is held. */
  onKeyDown(key: Key | Key[], fn: (key: Key) => void): EventController;
  onKeyDown(fn: (key: Key) => void): EventController;
  /** Runs when a key (or any key) goes down. */
  onKeyPress(key: Key | Key[], fn: (key: Key) => void): EventController;
  onKeyPress(fn: (key: Key) => void): EventController;
  /** Like `onKeyPress` but repeats while held (OS key repeat). */
  onKeyPressRepeat(key: Key | Key[], fn: (key: Key) => void): EventController;
  onKeyPressRepeat(fn: (key: Key) => void): EventController;
  /** Runs when a key (or any key) goes up. */
  onKeyRelease(key: Key | Key[], fn: (key: Key) => void): EventController;
  onKeyRelease(fn: (key: Key) => void): EventController;
  /** Typed characters (for text entry). */
  onCharInput(fn: (ch: string) => void): EventController;

  // virtual buttons (keyboard, mouse, gamepad and touch UIs all press these)
  /** `true` while any of the buttons is held. */
  isButtonDown(btn: string | string[]): boolean;
  /** `true` the frame a button went down (any button without arguments). */
  isButtonPressed(btn?: string | string[]): boolean;
  /** `true` the frame a button went up (any button without arguments). */
  isButtonReleased(btn?: string | string[]): boolean;
  /** Runs every frame while a button (or any button) is held. */
  onButtonDown(btn: string | string[], fn: (btn: string) => void): EventController;
  onButtonDown(fn: (btn: string) => void): EventController;
  /** Runs when a button (or any button) goes down. */
  onButtonPress(btn: string | string[], fn: (btn: string) => void): EventController;
  onButtonPress(fn: (btn: string) => void): EventController;
  /** Runs when a button (or any button) goes up. */
  onButtonRelease(btn: string | string[], fn: (btn: string) => void): EventController;
  onButtonRelease(fn: (btn: string) => void): EventController;
  /**
   * Presses a virtual button from code (on-screen controls, bots, tests). Like
   * every input it takes effect at the start of the next frame and stays down
   * until `releaseButton` (it ORs with the button's physical bindings).
   */
  pressButton(btn: string): void;
  /** Releases a button pressed with `pressButton`. */
  releaseButton(btn: string): void;
  /** The physical bindings of a virtual button. */
  getButton(btn: string): ButtonBinding | undefined;
  /** Defines or replaces the physical bindings of a virtual button. */
  setButton(btn: string, binding: ButtonBinding): void;

  // mouse
  /** Mouse position in logical screen coordinates. */
  mousePos(): THREE.Vector2;
  /**
   * Mouse movement accumulated during this frame, in CSS pixels (works while
   * the pointer is locked).
   */
  mouseDeltaPos(): THREE.Vector2;
  /** `true` while a mouse button is held (default `"left"`). */
  isMouseDown(btn?: MouseButton): boolean;
  /** `true` the frame a mouse button went down (default `"left"`). */
  isMousePressed(btn?: MouseButton): boolean;
  /** `true` the frame a mouse button went up (default `"left"`). */
  isMouseReleased(btn?: MouseButton): boolean;
  /** Runs when a mouse button (or any button) goes down. */
  onMousePress(btn: MouseButton, fn: (pos: THREE.Vector2) => void): EventController;
  onMousePress(fn: (pos: THREE.Vector2) => void): EventController;
  /** Runs when a mouse button (or any button) goes up. */
  onMouseRelease(btn: MouseButton, fn: (pos: THREE.Vector2) => void): EventController;
  onMouseRelease(fn: (pos: THREE.Vector2) => void): EventController;
  /** Runs when the mouse moves. */
  onMouseMove(fn: (pos: THREE.Vector2, delta: THREE.Vector2) => void): EventController;
  /** Runs on wheel scroll (the page does not scroll while the pointer is over the canvas). */
  onScroll(fn: (delta: THREE.Vector2) => void): EventController;
  /** Locks the pointer to the canvas (first-person controls). Needs a user gesture. */
  lockPointer(): void;
  /** Releases the pointer lock. */
  unlockPointer(): void;
  /** `true` while the pointer is locked to the canvas. */
  isPointerLocked(): boolean;
  /**
   * Clicks (left button) on objects with `tag`: a raycast against their
   * meshes, nearest visible hit first, walking up the object tree until an
   * object with the tag. While the pointer is locked it aims at the screen center.
   */
  onClick(tag: Tag, fn: (obj: GameObj) => void): EventController;
  /** Clicks anywhere. */
  onClick(fn: () => void): EventController;
  /** When the cursor (or the crosshair while locked) starts pointing at an object with `tag`. */
  onHover(tag: Tag, fn: (obj: GameObj) => void): EventController;
  /** When it stops pointing at it. */
  onHoverEnd(tag: Tag, fn: (obj: GameObj) => void): EventController;

  // touch
  /** A finger touched the canvas. The first finger also acts as the left mouse button. */
  onTouchStart(fn: (pos: THREE.Vector2, touch: Touch) => void): EventController;
  /** A finger moved. */
  onTouchMove(fn: (pos: THREE.Vector2, touch: Touch) => void): EventController;
  /** A finger lifted. */
  onTouchEnd(fn: (pos: THREE.Vector2, touch: Touch) => void): EventController;
  /** `true` on touch devices (or once a touch was seen). */
  isTouchscreen(): boolean;

  // gamepad
  /** Stick position, each axis −1…1, with a dead zone (y grows downwards). */
  getGamepadStick(stick: "left" | "right"): THREE.Vector2;
  /** `true` while a gamepad button is held on any pad. */
  isGamepadButtonDown(btn: GamepadButton): boolean;
  /** Runs when a gamepad button (or any button) goes down. */
  onGamepadButtonPress(btn: GamepadButton, fn: (btn: GamepadButton) => void): EventController;
  onGamepadButtonPress(fn: (btn: GamepadButton) => void): EventController;
  /** A gamepad was connected. */
  onGamepadConnect(fn: (pad: Gamepad) => void): EventController;

  /**
   * Movement direction from four virtual buttons (and the left stick), as a
   * unit (or zero) vector on the XZ plane. The default buttons
   * `"left" "right" "up" "down"` (arrows + WASD) exist even if you never
   * defined them. `forward` is the camera's heading by default, −Z with
   * `relativeTo: "world"`.
   */
  inputDir(
    left?: string,
    right?: string,
    forward?: string,
    back?: string,
    opts?: InputDirOpts,
  ): THREE.Vector3;
}

declare module "../../core/types.js" {
  interface PluginRegistry {
    input: InputAPI;
  }
  interface ThreeplayOpts extends InputOpts {}
}
