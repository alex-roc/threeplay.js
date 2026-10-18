---
title: Coming from kaplay
description: A map from kaplay to threeplay - what is the same, what changes with a third dimension and a physics engine, and a side-by-side example.
sidebar:
  order: 14
---

threeplay is built to feel like [kaplay](https://kaplayjs.com): components in a list, tags, `add()`, `onUpdate`, `onCollide`, scenes, virtual buttons, `debug.inspect`, all in one script. If you know kaplay you already know most of the names. This page covers what moves, what is new, and the few places where the same name means something different.

## The same game in both

A square that falls on a floor, with left/right to move and space to jump.

```js
// kaplay
kaplay();
setGravity(1600);

add([rect(width(), 48), pos(0, height() - 48), area(), body({ isStatic: true }), color(127, 200, 255)]);
const player = add([rect(32, 32), pos(80, 40), area(), body(), color("tomato")]);

onKeyPress("space", () => player.isGrounded() && player.jump());
onKeyDown("left", () => player.move(-240, 0));
onKeyDown("right", () => player.move(240, 0));
```

```js
// threeplay
threeplay();
setGravity(20);

add([box(30, 1, 6), pos(0, -0.5, 0), area(), body({ isStatic: true }), color(127, 200, 255)]);
const player = add([box(1), pos(-4, 2, 0), area(), character(), color("tomato")]);
camPos(0, 4, 14);

onKeyPress("space", () => player.isGrounded() && player.jump());
onKeyDown("left", () => player.move(-6, 0, 0));
onKeyDown("right", () => player.move(6, 0, 0));
```

The structure is the same. What changed: shapes are 3D (`box`, with sizes in meters), `pos` has a third coordinate and **Y is up**, there is a camera to place, and the player is a `character()` (a controller built for walking) instead of a dynamic `body()`. Everything in the second listing is explained below.

## Mapping table

| kaplay | threeplay | Notes |
| --- | --- | --- |
| `kaplay({...})` | `threeplay({...})` | Global mode by default, like kaplay. `global: false` returns `k`. |
| `pos(x, y)` | `pos(x, y, z)` | Meters. **Y is up**, −Z is forward. `obj.pos` is a `THREE.Vector3`. |
| `rect(w, h)`, `circle(r)` | `box(w, h, d)`, `sphere(r)`, `capsule`, `cylinder`, `cone`, `plane` | Primitive 3D shapes. See [Shapes and rendering](/threeplay.js/guides/shapes-and-rendering/). |
| `sprite("bean")`, `loadSprite` | `model("name")`, `loadModel` (glTF) and `material({ map })`, `loadTexture` | Models replace sprites. Animations use `playAnim`. |
| `color(r, g, b)`, `opacity(n)` | `color(...)`, `opacity(n)` | Same. `obj.color` is a `THREE.Color`. |
| `rotate(angle)` | `rotate(y)` or `rotate(x, y, z)` | Degrees. The angle lives in `obj.rot` (a vector), not `obj.angle`. |
| `scale(n)` | `scale(n)` or `scale(x, y, z)` | Same idea. |
| `anchor("center")` | `anchor("center")` | For HUD elements only. |
| `area()` | `area()` | A Rapier collider. **Without `body()` it is a sensor.** |
| `body()`, `body({ isStatic: true })` | `body()`, `body({ isStatic: true })` | A Rapier rigid body; also `kinematic`. `jump()`, `isGrounded()` work. For players, prefer `character()`. |
| `setGravity(1600)` | `setGravity(20)` | Meters per second squared; the default is 20. |
| `onCollide("a", "b", fn)`, `obj.onCollide("tag", fn)` | The same | Plus `onCollideUpdate` and `onCollideEnd`. |
| `addLevel(map, { tileWidth, tileHeight, tiles })` | `addLevel(map, { tileSize, tiles })` | Lays out on the **XZ plane**. Builders get `(p, col, row)`. See [Levels](/threeplay.js/guides/levels/). |
| `text("hi", { size })` + `fixed()` | `text("hi", { size })` + `fixed()` | A DOM element on top of the game. `pos` is in logical pixels. |
| `camPos(x, y)`, `camScale`, `camRot` | `camPos(x, y, z)`, `camLookAt`, `camFov`, `camFollow`, ... | A perspective camera with ready-made controllers. See [Camera](/threeplay.js/guides/camera/). |
| `shake(n)` | `camShake(intensity, duration)` | |
| `onKeyPress`, `onKeyDown`, `isKeyDown`, `onMousePress`, `mousePos()`... | The same | Key names match (`"left"`, `"space"`...). |
| `buttons: { jump: { keyboard, gamepad } }`, `onButtonPress`, `isButtonDown`, `pressButton` | The same | Plus the defaults `left`, `right`, `up`, `down`, `jump`. |
| `onClick("tag", fn)` | `onClick("tag", fn)` | A raycast into the 3D scene. Add `onHover` / `onHoverEnd`. |
| `scene`, `go`, `getSceneName` | The same | Listener scoping differs, see below. |
| `wait`, `loop`, `tween(from, to, dur, set, easing)` | The same | `easings.easeOutQuad` etc. Controllers are awaitable. |
| `state()`, `health()`, `lifespan()`, `timer()`, `offscreen()` | The same names | See [Gameplay components](/threeplay.js/guides/gameplay/). |
| `get`, `destroy`, `destroyAll`, `obj.is`, `obj.use`, `obj.has` | The same | `obj.tags` is a `Set`. |
| `vec2(x, y)` | `vec3(x, y, z)` | A `THREE.Vector3`: its methods are three.js'. |
| `rgb`, `rand`, `randi`, `choose`, `chance`, `lerp`, `clamp`, `map`, `wave` | The same | See [Transform](/threeplay.js/guides/transform/#math-helpers). |
| `play`, `loadSound` | `play`, `loadSound` | Plus positional sound with `at` and `beep()`. |
| `debug.inspect`, `debug.paused`, `debug.timeScale`, `debug.log` | The same | F1 toggles the inspector. |
| `width()`, `height()`, `center()` | The same | Logical size of the game. |
| `onDraw`, `drawRect`, `drawText`... | none | There is no immediate-mode drawing. Use objects, the DOM HUD, or three.js directly. |
| `layer`, `z()` | none | 3D has a depth buffer: depth comes from position. |
| plugins: `(k) => ({...})` | `(k) => ({...})` or `definePlugin` | See [Writing plugins](/threeplay.js/guides/plugins/). |

## Key differences

### 1. Three dimensions

- **Y is up**, not down. Moving "up" is `+y`. The ground plane is XZ, and the camera looks along −Z by default.
- **Units are meters.** A character is about 1.8 high; a tile in a level is typically 1 to 4. Speeds are in m/s (6 is a brisk walk), gravity in m/s².
- **Angles are degrees**, and rotation is a vector: `obj.rot.y` is the heading. `lookAt(target)` and `forward()` replace most manual trigonometry.
- There is **a camera to set up**. Nothing is visible until it frames the action. The default one sits at (0, 5, 10) looking at the origin; use `camFollow`, `thirdPerson`, `topDown`... or `camPos` and `camLookAt`.
- Vectors are three.js vectors, and their methods **mutate**: `a.add(b)` changes `a`. Use `.clone()` when you want a new one.

### 2. Listener scopes

In kaplay, `go()` also removes listeners that were registered at the top level. In threeplay:

- listeners registered **inside a scene** (or during one of its frames) die with it,
- listeners registered **at the top level** persist across scenes.

A global pause key or mute button just works. See [Scenes, events and time](/threeplay.js/guides/scenes-and-events/#listener-scopes). Also: `go()` destroys **every** object, top-level ones included, and resets the camera.

### 3. The physics engine

Collisions come from [Rapier](https://rapier.rs), a real physics engine, rather than from kaplay's built-in 2D collision. In practice:

- `area()` **alone is a sensor**: it detects overlaps and fires events but never blocks anything, and it moves freely with its `pos`. Solid things (floors, walls, crates) need `body()` too, and `area()` alone is the tool for triggers and pickups.
- `body()` is a real **dynamic** rigid body: it tumbles, bounces and slides. For something you steer (a player, an NPC), use **`character()`**, a kinematic controller that slides along walls, climbs steps and falls with gravity. `move(x, y, z)` is its API, as in kaplay.
- Gravity is in **m/s²**, the default is 20 (not 9.81: see [Physics](/threeplay.js/guides/physics/#gravity)). Physics steps at a fixed 50 Hz.
- There are extras kaplay doesn't have: `raycast`, impulses and forces, `kinematic` bodies, `ccd`, trimesh and convex hull colliders.
- Rapier is loaded when the game starts; the first scene waits for it. `physics: false` skips it.

### 4. The HUD is DOM, not canvas

`text()` and `uiRect()` draw HTML elements over the canvas, so any font and emoji work, and you style them with CSS through `obj.el`. As in kaplay, `fixed()` means "screen space" (`pos` in logical pixels from the top-left), but **without** `fixed()` a text is not drawn in the world: it **floats over the object's position**, always facing the screen. There is no `onDraw`.

### 5. Other things to know

- **Models, not sprites.** Free 3D assets (such as [Kenney's](https://kenney.nl/assets)) come as glTF; see [Assets and audio](/threeplay.js/guides/assets-and-audio/). Skeletal animations replace sprite animations.
- **No shaders or particles API yet.** Use three.js directly (`k.scene3d`, `k.renderer.three`, `obj.object3d`) for anything the engine doesn't cover.
- **WebGPU with a WebGL2 fallback**, chosen automatically (`renderer: "auto"`).
- **The three.js scene graph is the object tree**: children objects are nested three.js nodes, and `obj.object3d` is always there.
- The same code runs headless for tests (`renderer: "none"`, `loop: "manual"`, `k.step()`), see [Debugging and testing](/threeplay.js/guides/debugging/#headless-testing).
