import { type Object3D, Raycaster, Vector2, Vector3 } from "three";
import { definePlugin } from "../../core/engine";
import type { Engine, EventController, GameObj, Tag } from "../../core/types";
import { gameObjOf } from "../../core/util";
import { horizontalForward, inputToWorld } from "./dir";
import { type GamepadLike, readGamepads } from "./gamepad";
import {
  DEFAULT_BUTTONS,
  mouseButtonName,
  normalizeKey,
  shouldPreventDefault,
  toList,
} from "./keys";
import { hasAny, isBindingDown, PressState } from "./state";
import type { ButtonBinding, GamepadButton, InputAPI, Key, MouseButton } from "./types";

export type * from "./types";

/** Counts live listeners of an event so the expensive work (raycasts) can be skipped without any. */
interface ListenerCount {
  n: number;
}

/**
 * Keeps `counter.n` equal to the number of live (not cancelled) listeners.
 * The controller stays the core's own, so scene scoping is untouched.
 */
function counted(ctrl: EventController, counter: ListenerCount): EventController {
  counter.n++;
  const cancel = ctrl.cancel;
  let live = true;
  ctrl.cancel = () => {
    if (live) {
      live = false;
      counter.n--;
    }
    cancel();
  };
  return ctrl;
}

/** `true` if the node and every ancestor are visible (raycasts ignore `visible`). */
function visibleChain(node: Object3D | null): boolean {
  for (let n = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/** Walks from `obj` up the object tree to the first object with `tag`. */
function withTag(obj: GameObj | null, tag: Tag): GameObj | null {
  for (let o = obj; o; o = o.parent) if (o.is(tag)) return o;
  return null;
}

/**
 * Built-in plugin: keyboard, virtual buttons, mouse, touch, gamepad and
 * `inputDir()`. DOM events are queued and processed at `frameStart`, so
 * handlers run inside the frame (scene scoping applies) and results are
 * deterministic. Every `on*` function is built on the core's `k.on`.
 */
export const inputPlugin = definePlugin<InputAPI>({
  name: "input",
  dependencies: ["render"],
  install(k: Engine) {
    const canvas = k.canvas ?? null;

    // --- state ------------------------------------------------------------
    const keys = new PressState<Key>();
    const mouse = new PressState<MouseButton>();
    const pads = new PressState<GamepadButton>();
    const buttons = new PressState<string>();
    /** Virtual buttons held from code (`pressButton`). */
    const codeDown = new Set<string>();
    const bindings = new Map<string, ButtonBinding>(
      Object.entries({ ...DEFAULT_BUTTONS, ...(k.opts.buttons ?? {}) }),
    );
    const mousePosition = new Vector2();
    const mouseDelta = new Vector2();
    const sticks = { left: new Vector2(), right: new Vector2() };
    let locked = false;
    let touchSeen = false;

    const queue: Array<() => void> = [];
    const clickListeners: ListenerCount = { n: 0 };
    const hoverListeners: ListenerCount = { n: 0 };
    let hoverDirty = false;
    let hoverChain = new Set<GameObj>();

    const sources = {
      keyDown: (key: Key) => keys.down.has(key),
      mouseDown: (btn: MouseButton) => mouse.down.has(btn),
      padDown: (btn: GamepadButton) => pads.down.has(btn),
    };

    /** Recomputes every virtual button; fires press/release on each change. */
    function refreshButtons() {
      const names = new Set([...bindings.keys(), ...codeDown, ...buttons.down]);
      for (const name of names) {
        const binding = bindings.get(name);
        const isDown = codeDown.has(name) || (!!binding && isBindingDown(binding, sources));
        if (isDown) {
          if (buttons.press(name)) k.trigger("buttonPress", name);
        } else if (buttons.release(name)) {
          k.trigger("buttonRelease", name);
        }
      }
    }

    // --- queued event processing -----------------------------------------
    function keyDown(key: Key, repeat: boolean) {
      if (repeat && keys.down.has(key)) {
        k.trigger("keyPressRepeat", key);
        return;
      }
      if (!keys.press(key)) return;
      k.trigger("keyPress", key);
      k.trigger("keyPressRepeat", key);
      refreshButtons();
    }

    function keyUp(key: Key) {
      if (!keys.release(key)) return;
      k.trigger("keyRelease", key);
      refreshButtons();
    }

    function mouseMove(pos: Vector2, delta: Vector2) {
      mousePosition.copy(pos);
      mouseDelta.add(delta);
      hoverDirty = true;
      k.trigger("mouseMove", pos.clone(), delta.clone());
    }

    function mouseDown(btn: MouseButton, pos: Vector2) {
      mousePosition.copy(pos);
      if (!mouse.press(btn)) return;
      k.trigger("mousePress", btn, pos.clone());
      refreshButtons();
      if (btn === "left") {
        k.trigger("click");
        if (clickListeners.n > 0) k.trigger("clickObject", pick(pointerForPicking()));
      }
    }

    function mouseUp(btn: MouseButton, pos: Vector2) {
      mousePosition.copy(pos);
      if (!mouse.release(btn)) return;
      k.trigger("mouseRelease", btn, pos.clone());
      refreshButtons();
    }

    function releaseEverything() {
      for (const key of keys.releaseAll()) k.trigger("keyRelease", key);
      for (const btn of mouse.releaseAll()) k.trigger("mouseRelease", btn, mousePosition.clone());
      codeDown.clear();
      refreshButtons();
    }

    // --- raycasting (onClick / onHover) -----------------------------------
    const raycaster = new Raycaster();

    /** The point clicks and hovers aim at: the cursor, or the crosshair while locked. */
    function pointerForPicking(): Vector2 {
      if (locked && typeof k.center === "function") return k.center();
      return mousePosition;
    }

    /** The game object under a logical screen point (first visible hit), if any. */
    function pick(pos: Vector2): GameObj | null {
      if (typeof k.screenRay !== "function") return null;
      raycaster.ray.copy(k.screenRay(pos));
      raycaster.camera = k.camera3d;
      // Transforms changed this frame are not rendered yet.
      k.root.object3d.updateMatrixWorld();
      for (const hit of raycaster.intersectObject(k.root.object3d, true)) {
        if (!visibleChain(hit.object)) continue;
        const obj = gameObjOf(hit.object);
        if (obj && obj !== k.root) return obj;
      }
      return null;
    }

    function updateHover() {
      if (!hoverDirty || hoverListeners.n === 0) return;
      hoverDirty = false;
      const next = new Set<GameObj>();
      for (let o = pick(pointerForPicking()); o && o !== k.root; o = o.parent) next.add(o);
      const previous = hoverChain;
      hoverChain = next;
      for (const o of next) if (!previous.has(o)) k.trigger("hoverStart", o);
      for (const o of previous) if (!next.has(o)) k.trigger("hoverEnd", o);
    }

    // --- gamepad polling ----------------------------------------------------
    function pollGamepads() {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
      const snap = readGamepads(navigator.getGamepads() as unknown as (GamepadLike | null)[]);
      sticks.left = snap.left;
      sticks.right = snap.right;
      let changed = false;
      for (const name of snap.down) {
        if (pads.press(name)) {
          k.trigger("gamepadButtonPress", name);
          changed = true;
        }
      }
      for (const name of [...pads.down]) {
        if (!snap.down.has(name) && pads.release(name)) changed = true;
      }
      if (changed) refreshButtons();
    }

    // --- hooks --------------------------------------------------------------
    k.hooks.on("frameStart", () => {
      // Events queued by handlers during processing wait for the next frame.
      for (const fn of queue.splice(0)) fn();
      pollGamepads();
      updateHover();
    });
    k.hooks.on("beforeUpdate", () => {
      for (const key of keys.down) k.trigger("keyDown", key);
      for (const btn of buttons.down) k.trigger("buttonDown", btn);
    });
    k.hooks.on("frameEnd", () => {
      keys.endFrame();
      mouse.endFrame();
      pads.endFrame();
      buttons.endFrame();
      mouseDelta.set(0, 0);
    });
    k.hooks.on("sceneEnter", () => {
      hoverChain = new Set();
    });

    // --- DOM ----------------------------------------------------------------
    const disposers: Array<() => void> = [];
    const listen = (
      target: EventTarget,
      type: string,
      fn: (e: any) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn, opts);
      disposers.push(() => target.removeEventListener(type, fn, opts));
    };

    if (canvas) {
      const win = canvas.ownerDocument.defaultView ?? window;
      const doc = canvas.ownerDocument;
      canvas.tabIndex = 0;
      canvas.style.outline = "none";
      const focus = () => canvas.focus({ preventScroll: true });
      k.hooks.on("loaded", focus);

      /** Logical position of a client point (the canvas box is exactly the drawn area). */
      const logical = (clientX: number, clientY: number) => {
        const r = canvas.getBoundingClientRect();
        const s = (typeof k.viewScale === "function" ? k.viewScale() : 1) || 1;
        return new Vector2((clientX - r.left) / s, (clientY - r.top) / s);
      };

      // keyboard (on the canvas, so synthetic events dispatched to it work too)
      listen(canvas, "keydown", (e: KeyboardEvent) => {
        const key = normalizeKey(e.key, e.code);
        if (shouldPreventDefault(key, e)) e.preventDefault();
        queue.push(() => keyDown(key, e.repeat));
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const ch = e.key;
          queue.push(() => k.trigger("charInput", ch));
        }
      });
      listen(canvas, "keyup", (e: KeyboardEvent) => {
        const key = normalizeKey(e.key, e.code);
        if (shouldPreventDefault(key, e)) e.preventDefault();
        queue.push(() => keyUp(key));
      });
      listen(win, "blur", () => queue.push(releaseEverything));

      // mouse
      listen(canvas, "pointerdown", focus);
      listen(canvas, "mousedown", (e: MouseEvent) => {
        const btn = mouseButtonName(e.button);
        const pos = logical(e.clientX, e.clientY);
        queue.push(() => mouseDown(btn, pos));
      });
      listen(win, "mouseup", (e: MouseEvent) => {
        const btn = mouseButtonName(e.button);
        const pos = logical(e.clientX, e.clientY);
        queue.push(() => mouseUp(btn, pos));
      });
      listen(win, "mousemove", (e: MouseEvent) => {
        const pos = logical(e.clientX, e.clientY);
        const delta = new Vector2(e.movementX || 0, e.movementY || 0);
        queue.push(() => mouseMove(pos, delta));
      });
      listen(
        canvas,
        "wheel",
        (e: WheelEvent) => {
          e.preventDefault();
          const delta = new Vector2(e.deltaX, e.deltaY);
          queue.push(() => k.trigger("scroll", delta));
        },
        { passive: false },
      );
      listen(canvas, "contextmenu", (e: Event) => e.preventDefault());
      listen(doc, "pointerlockchange", () => {
        locked = doc.pointerLockElement === canvas;
      });

      // touch (the first finger also acts as the left mouse button)
      let primary: number | null = null;
      const lastClient = new Vector2();
      const touchHandler = (event: "touchStart" | "touchMove" | "touchEnd") => (e: TouchEvent) => {
        e.preventDefault();
        touchSeen = true;
        for (const touch of Array.from(e.changedTouches)) {
          const pos = logical(touch.clientX, touch.clientY);
          const isPrimary =
            (event === "touchStart" && primary === null) || touch.identifier === primary;
          if (event === "touchStart" && isPrimary) primary = touch.identifier;
          const delta = new Vector2(touch.clientX, touch.clientY).sub(lastClient);
          if (isPrimary) lastClient.set(touch.clientX, touch.clientY);
          queue.push(() => {
            k.trigger(event, pos.clone(), touch);
            if (!isPrimary) return;
            if (event === "touchStart") {
              mouseMove(pos, new Vector2());
              mouseDown("left", pos);
            } else if (event === "touchMove") {
              mouseMove(pos, delta);
            } else {
              mouseUp("left", pos);
            }
          });
          if (event === "touchEnd" && isPrimary) primary = null;
        }
      };
      listen(canvas, "touchstart", touchHandler("touchStart"), { passive: false });
      listen(canvas, "touchmove", touchHandler("touchMove"), { passive: false });
      listen(canvas, "touchend", touchHandler("touchEnd"), { passive: false });
      listen(canvas, "touchcancel", touchHandler("touchEnd"), { passive: false });

      // gamepad
      listen(win, "gamepadconnected", (e: GamepadEvent) => {
        queue.push(() => k.trigger("gamepadConnect", e.gamepad));
      });
    }
    k.onQuit(() => {
      for (const off of disposers.splice(0)) off();
    });

    // --- helpers for the on* family ---------------------------------------
    /** `on(fn)` or `on(filter, fn)` over events whose first argument is the input name. */
    function onNamed(
      event: string,
      a: unknown,
      b: ((...args: any[]) => void) | undefined,
      norm: (s: string) => string = (s) => s,
    ): EventController {
      if (typeof a === "function") return k.on(event, a as (...args: any[]) => void);
      const wanted = new Set(toList(a as string | string[]).map((s) => norm(s)));
      return k.on(event, (name: string, ...rest: unknown[]) => {
        if (wanted.has(name)) b!(name, ...rest);
      });
    }
    /** Same for mouse events, whose handlers receive `(pos)` and are filtered by button. */
    function onMouse(event: string, a: unknown, b?: (...args: any[]) => void): EventController {
      if (typeof a === "function")
        return k.on(event, (_btn: string, ...rest: unknown[]) => a(...rest));
      return k.on(event, (btn: string, ...rest: unknown[]) => {
        if (btn === a) b!(...rest);
      });
    }

    const normKeys = (key?: Key | Key[]) =>
      key === undefined ? undefined : toList(key).map((x) => normalizeKey(x));
    const buttonDown = (btn: string | string[]) => toList(btn).some((n) => buttons.down.has(n));

    function setPointerLock(on: boolean) {
      if (!canvas) return;
      try {
        if (on) {
          const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          result?.catch?.(() => {});
        } else {
          canvas.ownerDocument.exitPointerLock();
        }
      } catch {
        // Not allowed right now (no user gesture, or unsupported): ignore.
      }
    }

    return {
      // keyboard
      isKeyDown: (key) => toList(key).some((x) => keys.down.has(normalizeKey(x))),
      isKeyPressed: (key) => hasAny(keys.pressed, normKeys(key)),
      isKeyReleased: (key) => hasAny(keys.released, normKeys(key)),
      onKeyDown: (a: any, b?: any) => onNamed("keyDown", a, b, normalizeKey),
      onKeyPress: (a: any, b?: any) => onNamed("keyPress", a, b, normalizeKey),
      onKeyPressRepeat: (a: any, b?: any) => onNamed("keyPressRepeat", a, b, normalizeKey),
      onKeyRelease: (a: any, b?: any) => onNamed("keyRelease", a, b, normalizeKey),
      onCharInput: (fn) => k.on("charInput", fn),

      // virtual buttons
      isButtonDown: buttonDown,
      isButtonPressed: (btn) => hasAny(buttons.pressed, btn),
      isButtonReleased: (btn) => hasAny(buttons.released, btn),
      onButtonDown: (a: any, b?: any) => onNamed("buttonDown", a, b),
      onButtonPress: (a: any, b?: any) => onNamed("buttonPress", a, b),
      onButtonRelease: (a: any, b?: any) => onNamed("buttonRelease", a, b),
      pressButton(btn) {
        queue.push(() => {
          codeDown.add(btn);
          refreshButtons();
        });
      },
      releaseButton(btn) {
        queue.push(() => {
          codeDown.delete(btn);
          refreshButtons();
        });
      },
      getButton: (btn) => bindings.get(btn),
      setButton(btn, binding) {
        bindings.set(btn, binding);
        refreshButtons();
      },

      // mouse
      mousePos: () => mousePosition.clone(),
      mouseDeltaPos: () => mouseDelta.clone(),
      isMouseDown: (btn = "left") => mouse.down.has(btn),
      isMousePressed: (btn = "left") => mouse.pressed.has(btn),
      isMouseReleased: (btn = "left") => mouse.released.has(btn),
      onMousePress: (a: any, b?: any) => onMouse("mousePress", a, b),
      onMouseRelease: (a: any, b?: any) => onMouse("mouseRelease", a, b),
      onMouseMove: (fn) => k.on("mouseMove", fn),
      onScroll: (fn) => k.on("scroll", fn),
      lockPointer: () => setPointerLock(true),
      unlockPointer: () => setPointerLock(false),
      isPointerLocked: () => locked,
      onClick: (a: any, b?: any) => {
        if (typeof a === "function") return k.on("click", () => a());
        return counted(
          k.on("clickObject", (hit: GameObj | null) => {
            const obj = withTag(hit, a);
            if (obj) b(obj);
          }),
          clickListeners,
        );
      },
      onHover: (tag, fn) =>
        counted(
          k.on("hoverStart", (o: GameObj) => {
            if (o.is(tag)) fn(o);
          }),
          hoverListeners,
        ),
      onHoverEnd: (tag, fn) =>
        counted(
          k.on("hoverEnd", (o: GameObj) => {
            if (o.is(tag)) fn(o);
          }),
          hoverListeners,
        ),

      // touch
      onTouchStart: (fn) => k.on("touchStart", fn),
      onTouchMove: (fn) => k.on("touchMove", fn),
      onTouchEnd: (fn) => k.on("touchEnd", fn),
      isTouchscreen: () =>
        touchSeen ||
        (typeof window !== "undefined" && "ontouchstart" in window) ||
        (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0),

      // gamepad
      getGamepadStick: (stick) => sticks[stick].clone(),
      isGamepadButtonDown: (btn) => pads.down.has(btn),
      onGamepadButtonPress: (a: any, b?: any) => onNamed("gamepadButtonPress", a, b),
      onGamepadConnect: (fn) => k.on("gamepadConnect", fn),

      inputDir(left = "left", right = "right", forward = "up", back = "down", opts = {}) {
        const stick = sticks.left;
        const x = (buttonDown(right) ? 1 : 0) - (buttonDown(left) ? 1 : 0) + stick.x;
        const ahead = (buttonDown(forward) ? 1 : 0) - (buttonDown(back) ? 1 : 0) - stick.y;
        const facing =
          (opts.relativeTo ?? "camera") === "camera"
            ? horizontalForward(k.camera3d)
            : new Vector3(0, 0, -1);
        return inputToWorld(x, ahead, facing);
      },
    };
  },
});
