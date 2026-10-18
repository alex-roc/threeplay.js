import type { ButtonBinding, GamepadButton, Key, MouseButton } from "./types.js";

const KEY_ALIASES: Record<string, string> = {
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  arrowdown: "down",
  " ": "space",
  spacebar: "space",
  esc: "escape",
  del: "delete",
  ctrl: "control",
  cmd: "meta",
  os: "meta",
};

/**
 * Normalizes a key to the kaplay-style name: `e.key` lowercased with the
 * aliases `ArrowLeft → "left"`, `" " → "space"`. Pass `code` (`e.code`) so that
 * `shift+1` still reads as `"1"` instead of `"!"`.
 */
export function normalizeKey(key: string, code?: string): Key {
  if (code?.startsWith("Digit") && code.length === 6) return code[5]!;
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/** Keys whose default action scrolls or moves focus, which a game never wants. */
const PREVENT_KEYS = new Set(["left", "right", "up", "down", "space", "tab", "backspace"]);

/**
 * `true` if the browser default of this key press must be cancelled (so the
 * host page or iframe does not scroll). Combos with ctrl/meta are left alone.
 */
export function shouldPreventDefault(
  key: Key,
  mods: { ctrlKey?: boolean; metaKey?: boolean } = {},
): boolean {
  return PREVENT_KEYS.has(key) && !mods.ctrlKey && !mods.metaKey;
}

/** DOM `MouseEvent.button` → mouse button name. */
export function mouseButtonName(button: number): MouseButton {
  return (["left", "middle", "right", "back", "forward"] as const)[button] ?? "left";
}

/** Standard-mapping gamepad button names, indexed like `Gamepad.buttons`. */
export const GAMEPAD_BUTTONS: readonly GamepadButton[] = [
  "south",
  "east",
  "west",
  "north",
  "lshoulder",
  "rshoulder",
  "ltrigger",
  "rtrigger",
  "select",
  "start",
  "lstick",
  "rstick",
  "dpad-up",
  "dpad-down",
  "dpad-left",
  "dpad-right",
  "home",
];

/** Buttons defined unless `opts.buttons` overrides them (arrows + WASD, space). */
export const DEFAULT_BUTTONS: Readonly<Record<string, ButtonBinding>> = {
  left: { keyboard: ["left", "a"], gamepad: "dpad-left" },
  right: { keyboard: ["right", "d"], gamepad: "dpad-right" },
  up: { keyboard: ["up", "w"], gamepad: "dpad-up" },
  down: { keyboard: ["down", "s"], gamepad: "dpad-down" },
  jump: { keyboard: "space", gamepad: "south" },
};

/** Wraps a value in an array (`undefined` → `[]`). */
export function toList<T>(v: T | readonly T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? [...v] : [v as T];
}
