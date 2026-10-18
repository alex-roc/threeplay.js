---
title: Input
description: Keyboard, virtual buttons, mouse, pointer lock, clicking on 3D objects, touch and gamepad, plus on-screen controls for phones.
sidebar:
  order: 6
---

threeplay reads the keyboard, mouse, touch screen and gamepads, and puts them all behind **virtual buttons**, so one line of game code works with every device. The API follows kaplay's.

```js
import threeplay from "threeplay";

threeplay({
  width: 960,
  height: 540,
  background: "#cdeac0",
  // Virtual buttons: any of these physical inputs presses them.
  buttons: {
    fire: { keyboard: "f", mouse: "left", gamepad: "west" },
    dash: { keyboard: "shift", gamepad: "rshoulder" },
  },
});

scene("main", () => {
  add([box(40, 1, 40), pos(0, -0.5, 0), color("#95d5b2"), area(), body({ isStatic: true })]);

  for (let i = 0; i < 4; i++) {
    add([box(1.2), pos(-6 + i * 4, 0.6, -4), color("tomato"), area(), body({ isStatic: true }), "target"]);
  }

  const player = add([capsule(0.4, 1.6), pos(0, 1, 3), color("#277da1"), area(), character(), "player"]);
  camFollow(player, { offset: vec3(0, 5, 9) });

  onUpdate(() => {
    const speed = isButtonDown("dash") ? 12 : 6;
    player.move(inputDir().multiplyScalar(speed)); // keyboard, d-pad or left stick
  });
  onButtonPress("jump", () => player.isGrounded() && player.jump());
  onButtonPress("fire", () => beep({ freq: 220, slideTo: 80, duration: 0.1 }));

  // Pointing at 3D objects
  onHover("target", (t) => t.color.set("white"));
  onHoverEnd("target", (t) => t.color.set("tomato"));
  onClick("target", (t) => {
    t.destroy();
    beep({ freq: 700, slideTo: 1400, duration: 0.12 });
  });

  // Mouse wheel zooms by changing the field of view
  onScroll((d) => camFov(clamp(camFov() + d.y * 0.02, 30, 100)));
});

go("main");
```

## How input works

- Input is **sampled at the start of each frame**. `isKeyPressed()` and friends are `true` for the whole frame in which the key went down, so it doesn't matter when in the frame you ask. A press and a release inside one frame still count.
- Handlers (`onKeyPress`...) run inside the frame, so scene scoping applies: a handler registered in a scene dies with it. See [Scenes and events](/threeplay.js/guides/scenes-and-events/).
- The keyboard is read **on the canvas**. The canvas takes focus when the game loads and whenever you click it. If your game is in an `<iframe>` or next to a text field, the player needs to click the game first.
- Arrows, space, tab and backspace don't scroll the page. F-keys and ctrl/cmd shortcuts are left to the browser.
- When the window loses focus, every key and mouse button is released.
- Input still works while the game is [paused](/threeplay.js/guides/scenes-and-events/#pausing), so a "P" key can unpause. (`onKeyDown` and `onButtonDown`, which run once per update, do not.)

## Keyboard

```js
isKeyDown("space");            // held right now
isKeyPressed("e");             // went down this frame
isKeyReleased("e");            // went up this frame
isKeyDown(["left", "a"]);      // any of several keys
isKeyPressed();                // any key at all

onKeyPress("space", () => player.jump());
onKeyPress(["enter", "p"], (key) => debug.log("pressed", key));
onKeyDown("w", () => player.move(0, 0, -5));   // every frame while held
onKeyRelease("shift", () => debug.log("released"));
onKeyPressRepeat("backspace", () => deleteChar());   // repeats while held (OS key repeat)
onCharInput((ch) => (name += ch));                   // typed characters, for text entry
```

Key names are lowercase and case-insensitive: letters and digits as typed (`"a"`, `"1"`), plus `"left"`, `"right"`, `"up"`, `"down"`, `"space"`, `"enter"`, `"escape"`, `"backspace"`, `"tab"`, `"shift"`, `"control"`, `"alt"`, `"meta"`, `"f1"` to `"f12"`. A few aliases work too: `"esc"`, `"ctrl"`, `"cmd"`. Every function accepts one key or an array.

`onKeyPress` and `onKeyDown` also accept just a handler, which then receives every key.

## Virtual buttons

A virtual button is a name that any number of keys, mouse buttons and gamepad buttons can press. Games should react to buttons, not to raw keys: players can rebind them and gamepads and touch controls come for free.

These five exist even if you never define them:

| Button | Keyboard | Gamepad |
| --- | --- | --- |
| `left` | arrow left, A | d-pad left |
| `right` | arrow right, D | d-pad right |
| `up` | arrow up, W | d-pad up |
| `down` | arrow down, S | d-pad down |
| `jump` | space | south (A / cross) |

Define your own with the `buttons` option. Each binding takes `keyboard`, `mouse` and `gamepad` entries, each a name or an array of names. Redefining a default name **replaces its binding entirely** (a new `jump` loses the gamepad button unless you list it).

```js
threeplay({
  buttons: {
    jump: { keyboard: ["space", "up"], gamepad: "south" },
    fire: { keyboard: "f", mouse: "left", gamepad: "west" },
  },
});
```

```js
isButtonDown("fire");                       // held
isButtonPressed("fire");                    // went down this frame (also with no argument: any button)
isButtonReleased("fire");
onButtonPress("fire", () => shoot());
onButtonDown("fire", () => charge());       // every frame while held
onButtonRelease("fire", () => release());

getButton("fire");                          // { keyboard: "f", mouse: "left", gamepad: "west" }
setButton("fire", { keyboard: "x" });       // rebind at runtime: a settings menu
```

### Movement: `inputDir`

`inputDir()` combines the `left`, `right`, `up` and `down` buttons (and the left stick of a gamepad) into a vector on the XZ plane:

```js
onUpdate(() => player.move(inputDir().multiplyScalar(6)));
```

By default "forward" is **where the camera looks**, flattened onto the ground, so WASD feels right with a follow, third-person or first-person camera. Pass `{ relativeTo: "world" }` to make forward `−Z` instead (fixed cameras, tank controls). You can use other button names:

```js
inputDir("left", "right", "up", "down", { relativeTo: "world" });
inputDir("strafeLeft", "strafeRight", "forward", "back");   // names of your own buttons
```

The result always has length 1, or 0 when nothing is pressed (so diagonals are not faster). That also means a half-pushed stick walks at full speed. For analog movement read the stick yourself with `getGamepadStick("left")`.

## Mouse

```js
mousePos();                  // THREE.Vector2, in logical screen coordinates (same as the HUD)
mouseDeltaPos();             // movement during this frame, in CSS pixels (works with a locked pointer)
isMouseDown();               // left button; also isMouseDown("right")
isMousePressed("right");
isMouseReleased("middle");

onMousePress((pos) => {});            // any button
onMousePress("left", (pos) => {});
onMouseRelease("left", (pos) => {});
onMouseMove((pos, delta) => {});
onScroll((delta) => camFov(camFov() + delta.y * 0.02));   // wheel; the page doesn't scroll over the canvas
```

Mouse buttons are `"left"`, `"right"`, `"middle"`, `"back"` and `"forward"`. The browser's context menu is disabled on the canvas, so the right button is yours.

### Pointer lock

First-person controls need the mouse to be captured:

```js
onClick(() => lockPointer());     // must be called after a user gesture
onKeyPress("escape", () => unlockPointer());   // the browser also releases it on Esc
isPointerLocked();
```

While the pointer is locked, `mouseDeltaPos()` keeps reporting movement. The [`firstPerson()` camera](/threeplay.js/guides/camera/) does all of this for you.

## Clicking and hovering over 3D objects

```js
onClick("enemy", (enemy) => enemy.hurt(1));    // click an object with the tag
onClick(() => debug.log("clicked somewhere"));   // click anywhere
onHover("button3d", (obj) => obj.color.set("white"));
onHoverEnd("button3d", (obj) => obj.color.set("gray"));
```

`onClick(tag, fn)` shoots a ray from the cursor through the scene and picks the **nearest visible** mesh. From the mesh it walks up the object tree to the first object with the tag, so clicking any part of a model or a child works. Notes:

- It tests the **meshes you see**, not the colliders, so objects don't need `area()`.
- Hidden objects (`obj.hidden = true`) can't be clicked.
- While the pointer is locked it aims at the **center of the screen** (a crosshair).
- Raycasts only run while someone is listening, and hover is checked at most once per frame, when the mouse moved.
- HUD elements are drawn over the canvas but don't catch clicks.

## Touch

The first finger acts as the left mouse button, so `onClick`, `onMousePress` and drag-to-orbit cameras work on phones without changes. For gestures:

```js
onTouchStart((pos, touch) => {});
onTouchMove((pos, touch) => {});
onTouchEnd((pos, touch) => {});
isTouchscreen();       // true on touch devices, or once a touch was seen
```

`pos` is in logical screen coordinates, like `mousePos()`. The page does not scroll or zoom while touching the canvas.

### On-screen controls

Phones have no keyboard. Draw buttons on the HUD and press virtual buttons from code with `pressButton(name)` and `releaseButton(name)`. They behave exactly like a key held down, so `inputDir()` and `onButtonPress("jump")` work unchanged.

```js
function touchButton(name, label, x, y) {
  const btn = add([text(label, { size: 30, align: "center" }), pos(x, y), anchor("center"), fixed()]);
  const el = btn.el; // the DOM element (null when headless)
  if (!el) return;
  Object.assign(el.style, {
    pointerEvents: "auto", // the HUD ignores the pointer by default
    touchAction: "none",
    padding: "16px 22px",
    borderRadius: "50%",
    background: "rgba(255,255,255,.25)",
  });
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pressButton(name);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    el.addEventListener(type, () => releaseButton(name));
  }
}

scene("main", () => {
  if (isTouchscreen()) {
    touchButton("left", "◀", 70, 470);
    touchButton("right", "▶", 170, 470);
    touchButton("jump", "A", 890, 470);
  }
});
```

Keep in mind that a pressed button stays down until you release it, and that presses made from code take effect at the start of the next frame.

## Gamepad

Any connected pad works, and the default buttons already include the d-pad and the south button.

```js
getGamepadStick("left");     // THREE.Vector2, each axis -1 to 1, with a dead zone (y grows downwards)
getGamepadStick("right");    // use it to look around
isGamepadButtonDown("south");
onGamepadButtonPress("south", () => player.jump());
onGamepadButtonPress((btn) => debug.log(btn));
onGamepadConnect((pad) => debug.log("connected:", pad.id));
```

Button names (standard mapping): `south`, `east`, `west`, `north`, `lshoulder`, `rshoulder`, `ltrigger`, `rtrigger`, `select`, `start`, `lstick`, `rstick`, `dpad-up`, `dpad-down`, `dpad-left`, `dpad-right` and `home`. Sticks have a 0.15 radial dead zone. Browsers only report a gamepad after the player presses a button on it.

:::tip
Prefer `buttons` bindings to `onGamepadButtonPress` in game code. Use the raw gamepad functions for things buttons can't express, such as the right stick.
:::
