---
title: Scenes, events, time and timers
description: Splitting a game into scenes, which listeners survive go(), custom and per-tag events, the game loop and its fixed step, timers, tweens and loading.
sidebar:
  order: 2
---

This guide covers the "plumbing" every game needs: scenes, events, time, timers and loading. Here is a small game that touches all of it. Pop the falling balls by clicking them.

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#1b1b2f" });

// Top level: this listener lives through every scene.
onKeyPress("escape", () => go("menu"));

scene("menu", () => {
  add([text("Click or press space to start", { size: 32 }), pos(480, 270), anchor("center"), fixed()]);
  onButtonPress("jump", () => go("game", { seconds: 15 }));
  onClick(() => go("game", { seconds: 15 }));
});

scene("game", ({ seconds }) => {
  let score = 0;
  const hud = add([text("Score: 0", { size: 22 }), pos(20, 16), fixed()]);

  // A custom event: whoever pops a ball announces it, the HUD listens.
  on("scored", () => {
    score++;
    hud.text = `Score: ${score}`;
    tween(1.5, 1, 0.3, (v) => (hud.textSize = 22 * v), easings.easeOutBack);
    beep({ freq: 500 + score * 40, duration: 0.08 });
  });

  loop(0.6, () => {
    add([sphere(0.4), pos(rand(-4, 4), 4, 0), color(choose(["tomato", "gold", "skyblue"])), "ball"]);
  });
  onUpdate("ball", (ball) => {
    ball.move(0, -2, 0);
    if (ball.pos.y < -1) ball.destroy();
  });
  onClick("ball", (ball) => {
    ball.destroy();
    trigger("scored");
  });

  wait(seconds, () => go("end", score));
});

scene("end", (score) => {
  add([text(`Time! You popped ${score}`, { size: 36 }), pos(480, 270), anchor("center"), fixed()]);
  wait(2, () => go("menu"));
});

go("menu");
```

## Scenes

`scene(name, fn)` defines a scene; `go(name, ...args)` switches to it and passes the extra arguments to `fn`. `getSceneName()` returns the name of the running one.

```js
scene("game", (level, difficulty) => { /* ... */ });
go("game", 3, "hard");
```

`go()` throws right away if the scene was never defined. When you call `go()` from inside a frame (an `onUpdate`, a collision, a click...) the switch is **deferred to the start of the next frame**, so the current frame finishes cleanly. Called from setup code (top level) it runs at once, or as soon as loading finishes. See [Loading](#loading).

### What `go()` clears

When a scene ends:

- **Every game object is destroyed**, including objects you added at top level before the first `go()`. Create your world inside scenes.
- **Scene listeners and timers are cancelled** (see the next section).
- **The camera is reset**: any camera controller stops and the camera goes back to its default position (0, 5, 10) looking at the origin, field of view 60. Start `camFollow`, `firstPerson`... inside the scene.
- `onSceneLeave(fn)` handlers run first. They receive the name of the next scene and are used for cleanup.

What it does **not** touch: background and fog, gravity, the time scale and pause state, sounds that are playing, the pointer lock, loaded assets, and plugin hooks. Set what you need at the start of each scene (examples call `setGravity(...)` there) and `stop()` music in `onSceneLeave`.

## Listener scopes

Every `on*` function (`onUpdate`, `onKeyPress`, `onCollide`, `onClick`, `on`, `wait`, `loop`, `tween`...) returns a controller and registers the listener in a **scope**:

- A listener registered **while a scene body or one of its frames is running** belongs to that scene. `go()` cancels it.
- A listener registered **outside** (top-level code, before any scene runs, or inside a plugin's `install`) is **global**. It lives forever, across scene changes.

```js
onKeyPress("m", () => debug.log("global: works in every scene"));

scene("game", () => {
  onKeyPress("space", () => debug.log("scene: gone after go()"));
  wait(5, () => debug.log("scene timer: also gone"));
});
```

:::caution[This differs from kaplay]
In kaplay, `go()` also removed listeners registered at the top level. In threeplay they persist, which is usually what you want for things like a global pause key or a mute button. If you register something at top level that should reset with the scene, move it into the scene.
:::

A few details:

- Registering a listener **inside a callback during a frame** (for instance an `onCollide` handler that calls `wait()`) puts it in the current *scene's* scope, even if the callback itself is global.
- Handlers on **an object** (`obj.onUpdate`, `obj.onCollide`, `obj.on`) live exactly as long as the object, whatever the scope.
- Plugin **hooks** (`k.hooks.on`) are system level and are never cleared. See [Writing plugins](/threeplay.js/guides/plugins/).

Controllers let you stop or silence a listener yourself:

```js
const ctrl = onUpdate(() => { /* ... */ });
ctrl.paused = true;   // skipped while true
ctrl.cancel();        // removed for good
```

## Events

### Global custom events

`on(event, fn)` listens and `trigger(event, ...args)` emits. Use them to decouple parts of your game:

```js
on("hit", (damage, who) => debug.log(who, "took", damage));
trigger("hit", 3, "player");
```

:::note
The engine's own internal events are prefixed with `threeplay:` (for example `"threeplay:keyPress"`), so any other name is yours. Don't `trigger` names starting with `threeplay:`.
:::

### Object events

Every object has its own events: `obj.on(event, fn)` and `obj.trigger(event, ...args)`. The engine and the built-in components emit several:

| Event | Emitted when | Handler receives |
| --- | --- | --- |
| `add` | the object enters the scene | nothing |
| `destroy` | the object is destroyed | nothing |
| `update`, `fixedUpdate` | every frame / fixed step | nothing |
| `collide`, `collideUpdate`, `collideEnd` | [physics contacts](/threeplay.js/guides/physics/) | `(other, collision)`, `(other)` for `collideEnd` |
| `ground` | a body or character lands | nothing |
| `hurt`, `heal`, `death` | [`health()`](/threeplay.js/guides/gameplay/) | amount, amount, nothing |
| `exitScreen`, `enterScreen` | `offscreen()` | nothing |
| `animEnd` | a non-looping model animation ended | animation name |

Many have helpers (`obj.onCollide`, `obj.onDeath`, `obj.onDestroy`...), but you can always use the raw event.

### Per-tag listeners

`on(event, tag, fn)` listens to an object event on **every object that has the tag**, present and future. The handler receives the object first, then the event's arguments:

```js
on("hurt", "enemy", (enemy, amount) => debug.log("enemy hurt", amount));
on("death", "enemy", (enemy) => enemy.destroy());
```

`obj.trigger("anything", ...)` reaches these listeners too, so your own events work the same way.

There are shortcuts for the most common ones:

| Function | Meaning |
| --- | --- |
| `onUpdate(fn)` / `onUpdate(tag, fn)` | every frame / for each object with the tag, every frame |
| `onFixedUpdate(fn)` / `onFixedUpdate(tag, fn)` | at the fixed rate |
| `onAdd(fn)` / `onAdd(tag, fn)` | when any object (or one with the tag) enters the scene |
| `onDestroy(fn)` / `onDestroy(tag, fn)` | when any object (or one with the tag) is destroyed |

```js
onUpdate("ball", (ball) => ball.move(0, -2, 0));
onAdd("coin", (coin) => debug.log("a coin appeared at", coin.pos));
```

`onAdd` fires **synchronously inside `add()`**, as the object enters the scene. Register it before you create the objects you want to catch.

## Time and the game loop

```js
dt();               // seconds since the last frame (scaled; 0 while paused)
fixedDt();          // seconds of one fixed step (scaled)
time();             // seconds since start, in game time
setTimeScale(0.5);  // slow motion (2 = fast forward, 0 = frozen)
getTimeScale();
setPaused(true);    // stop every update, keep rendering
isPaused();
```

Use `dt()` to make motion frame-rate independent. `pos.move()` does it for you; if you change `pos` directly, multiply by `dt()`:

```js
onUpdate(() => (box1.pos.x += 3 * dt()));
```

### What runs in a frame

Each frame runs in this order:

1. A pending `go()` starts its scene.
2. `frameStart` hook (input is processed here).
3. The **fixed steps**: for each one, objects' `fixedUpdate` and `onFixedUpdate` handlers, then the physics step. The step runs at **50 Hz** (`threeplay({ fixedHz })`), independent of the display rate. A slow frame runs several steps to catch up, at most 5, so the game slows down instead of spiralling.
4. Objects' `update` (components first, then `obj.onUpdate` handlers), then the global `onUpdate` handlers and timers.
5. Characters move and the camera is updated (`afterUpdate` hooks).
6. The frame is rendered (`render` hook), then `frameEnd` runs.

`dt` is clamped to `maxDt` (0.1 s by default, `threeplay({ maxDt })`): after a long pause (a hidden tab) the game does not jump ahead.

Put physics-related code that must be in sync with the simulation in `fixedUpdate` / `onFixedUpdate`, and everything else in `update`.

### Pausing

`setPaused(true)` freezes `dt()` at 0 and skips updates, fixed steps, timers and physics. Rendering and input keep working, so a key press handler can unpause:

```js
onKeyPress("p", () => setPaused(!isPaused()));
```

`obj.paused = true` pauses just one object and its children, and the timers of its `timer()` component.

## Timers

```js
wait(2, () => debug.log("two seconds later"));

loop(1, () => spawnEnemy());           // runs right away, then every second, forever
loop(0.5, () => beep(), 4);            // 4 times in total

tween(0, 5, 1, (v) => (box1.pos.x = v), easings.easeOutQuad);
```

| Function | What it does |
| --- | --- |
| `wait(seconds, fn?)` | Runs `fn` once after `seconds` of game time. |
| `loop(seconds, fn, count?)` | Runs `fn` right away and then every `seconds`, `count` times in total or forever. |
| `tween(from, to, duration, set, easing?)` | Calls `set(value)` every frame, easing from `from` to `to` over `duration` seconds (first call immediately with `from`). Works with numbers, `THREE.Vector2`, `Vector3` and `Color`. |

Timers use **game time**: they stop when the game is paused and follow the time scale. Each returns a controller with `cancel()`, `paused` and `finished`.

Easings are in `easings`: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInSine`, `easeOutSine`, `easeInOutSine`, `easeInBack`, `easeOutBack`, `easeOutElastic`, `easeInBounce`, `easeOutBounce`. An easing is any function from 0–1 to 0–1, so you can pass your own.

Vectors and colors tween as new values each frame, so copy them into place:

```js
tween(player.pos.clone(), vec3(0, 3, 0), 1, (v) => (player.pos = v), easings.easeInOutCubic);
tween(rgb("red"), rgb("blue"), 2, (c) => (box1.color = c));
```

### Awaiting a timer

Controllers are awaitable, which makes sequences easy to read:

```js
async function intro() {
  title.hidden = false;
  await wait(1.5);
  await tween(0, 1, 0.5, (v) => (title.opacity = v));
  await wait(1);
  go("game");
}
```

:::caution
If the scene ends while you are awaiting a timer, the timer is cancelled and the `await` **never resumes** (it is not rejected). That is usually what you want, since the objects it refers to are gone, but don't count on code after the `await` to clean things up.
:::

For timers tied to the life of one object (they stop when it is paused or destroyed), use the [`timer()` component](/threeplay.js/guides/gameplay/).

## Loading

Anything asynchronous (models, textures, sounds, your own `fetch`) goes through `load()`:

```js
load(fetch("levels.json").then((r) => r.json()).then((data) => (levels = data)));
```

The first scene **does not start until every loading task has settled**, and `go()` called earlier is queued. While loading, the engine draws a progress bar on its own. A task that fails is logged to the console and does not block the game.

| Function | What it does |
| --- | --- |
| `load(promise)` | Registers a task and returns the same promise. |
| `loadProgress()` | 0 to 1. |
| `isLoaded()` | `true` once every task finished. |
| `onLoad(fn)` | Runs `fn` when loading finishes, or right away if it already has. |

`loadModel`, `loadTexture` and `loadSound` call `load()` for you. See [Assets and audio](/threeplay.js/guides/assets-and-audio/).
