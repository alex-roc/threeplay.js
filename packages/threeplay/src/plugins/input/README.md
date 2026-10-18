# input

Keyboard, mouse, touch, gamepad and **virtual buttons**, kaplay-style. Depends on `render`
(the canvas, `viewScale()`, `screenRay()`).

```js
const k = threeplay({
  buttons: { fire: { keyboard: "f", mouse: "left", gamepad: "west" } },
});

k.scene("main", () => {
  const player = k.add([k.box(1), k.pos(), k.character()]);
  k.onUpdate(() => player.move(k.inputDir().multiplyScalar(6)));      // camera-relative WASD / arrows / stick
  k.onButtonPress("jump", () => player.jump());
  k.onButtonPress("fire", () => shoot());
  k.onClick("enemy", (enemy) => enemy.destroy());             // raycast against meshes
  k.onKeyPress("escape", () => k.go("menu"));
});
```

## How it works

- DOM events are **queued** and processed at the `frameStart` hook: states and handlers
  update inside the frame (so scene scoping applies and results are deterministic).
  `onKeyDown`/`onButtonDown` fire every frame while held (in `beforeUpdate`); the
  pressed/released sets are cleared at `frameEnd`. A press + release inside one frame still
  counts as pressed (and released) that frame. On window blur everything is released.
- Every `on*` function is a thin layer over `k.on(...)` / `k.trigger(...)`, so listeners
  registered in a scene die with it (`go()`), and top-level ones persist.
- **Keyboard is read on the canvas** (`canvas.tabIndex = 0`, `outline: none`, focused when
  loaded and on pointerdown). A host page can forward keys with
  `canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))`.
  Arrows, space, tab and backspace call `preventDefault` (no page scroll); F-keys and
  ctrl/meta combos do not.
- Key names are `e.key` lowercased (`"left"`, `"space"`, `"escape"`, `"f1"`…), see `normalizeKey`.

## Virtual buttons

`left/right/up/down` (arrows + WASD, d-pad) and `jump` (space, gamepad south) exist even if
you never define them. `opts.buttons` merges over them; redefining a name replaces its default.
A button is down if any keyboard/mouse/gamepad binding is down **or** it was pressed from code:
`k.pressButton("jump")` / `k.releaseButton("jump")` (what on-screen touch controls call;
takes effect at the next `frameStart`). `getButton` / `setButton` read and rebind at runtime.

## API summary

| Area | Functions |
| --- | --- |
| Keyboard | `isKeyDown/Pressed/Released`, `onKeyDown/Press/PressRepeat/Release`, `onCharInput` |
| Buttons | `isButtonDown/Pressed/Released`, `onButtonDown/Press/Release`, `pressButton`, `releaseButton`, `getButton`, `setButton` |
| Mouse | `mousePos` (logical), `mouseDeltaPos` (CSS px, per frame, works locked), `isMouse*`, `onMousePress/Release/Move`, `onScroll`, `lockPointer`, `unlockPointer`, `isPointerLocked` |
| Pointing | `onClick(tag, fn)`, `onClick(fn)`, `onHover(tag, fn)`, `onHoverEnd(tag, fn)` |
| Touch | `onTouchStart/Move/End`, `isTouchscreen` (first finger also drives the left mouse button) |
| Gamepad | `getGamepadStick("left" \| "right")` (0.15 radial dead zone), `isGamepadButtonDown`, `onGamepadButtonPress`, `onGamepadConnect` |
| Movement | `inputDir(left, right, forward, back, { relativeTo })` |

`onClick(tag)` / `onHover(tag)` raycast against `k.root.object3d` (nearest visible hit),
take that mesh's game object and walk up the tree to the first object with the tag. Raycasts
only run while such listeners exist, and hover at most once per frame, when the mouse moved.
While the pointer is locked they aim at the screen center.

`inputDir` returns a unit (or zero) XZ vector from the four buttons plus the left stick.
`relativeTo: "camera"` (default) uses `k.camera3d`'s heading flattened on XZ (straight up/down
falls back to screen-up); `"world"` uses −Z as forward.

## Files

- `index.ts` – the plugin (DOM wiring, queue, handlers).
- `keys.ts` – key/mouse names, default buttons, `preventDefault` policy (pure).
- `state.ts` – `PressState` (down/pressed/released) and binding resolution (pure).
- `gamepad.ts` – dead zone and pad snapshot merge (pure).
- `dir.ts` – camera heading and `inputToWorld` (pure).
- Tests: `input.test.ts` (Node), `input.dom.test.ts` (happy-dom).
