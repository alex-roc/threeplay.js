---
title: Debugging and testing
description: The F1 inspector, on-screen logging, pausing and slow motion, common problems, and running your game headless in tests.
sidebar:
  order: 12
---

threeplay ships with a small set of debugging tools, all behind the global `debug` object (`k.debug`).

```js
import threeplay from "threeplay";

threeplay({ debug: true, debugKey: "f2" }); // start with the inspector on; F2 toggles it (F1 by default)

add([plane(30), color("#33415c"), area(), body({ isStatic: true })]);
const crate = add([box(1), pos(0, 4, 0), color("tomato"), area(), body(), "crate"]);
camPos(0, 6, 10);
camLookAt(vec3(0, 1, 0));

debug.log("crate spawned at", crate.pos);              // console + on-screen
onKeyPress("p", () => (debug.paused = !debug.paused)); // freeze the game, keep drawing
onKeyPress("t", () => (debug.timeScale = debug.timeScale === 1 ? 0.25 : 1)); // slow motion
onKeyPress("i", () => debug.log(debug.hovered()?.inspect())); // what is under the mouse?
```

## The inspector

Press **F1** in a running game (or set `debug.inspect = true`, or start with `threeplay({ debug: true })`). A small panel appears in the top-left corner with:

- the FPS and the number of live objects,
- the renderer in use (`webgpu` or `webgl`) and the number of draw calls,
- for the object **under the mouse**: its id, tags and the `inspect()` line of each of its components.

While the inspector is on, **colliders and contacts are drawn as a wireframe** over the scene (Rapier's debug rendering), which makes a missing or misplaced collider obvious. Without the physics plugin it outlines the bounding box of every object that has a mesh instead.

To move the key use `threeplay({ debugKey: "f2" })`, and to disable the inspector for good (a released game, say) use `threeplay({ debugKey: false })`. The panel is cheap while it is off.

## Logging

`debug.log(...)` prints to the browser console **and** to a list in the bottom-left corner of the game that fades after about four seconds (the last eight messages are kept). That is handy on a phone, or when the console is hidden behind a fullscreen game.

```js
debug.log("score", score);                 // several values, like console.log
debug.log("hit!", { damage: 3, who: "player" });   // objects are shown as JSON
debug.error("could not spawn enemy");      // red, and console.error
debug.clearLog();
```

## Pause, speed and state

```js
debug.paused = true;      // the same as setPaused(true)
debug.timeScale = 0.25;   // the same as setTimeScale(0.25)
debug.fps();              // smoothed frames per second (honest even while paused)
debug.objectCount();      // live game objects
debug.hovered();          // the object under the mouse, or null
```

Slowing the game down is the best way to understand a fast bug (a bullet tunneling through a wall, a jump that is too short). Pausing keeps drawing and input alive, so you can still pick things with the mouse and read `debug.hovered()`.

## Custom `inspect()` lines

Components can contribute to the inspector by returning a short string from `inspect()` (see [Game objects](/threeplay.js/guides/game-objects/)). It is also available from code as `obj.inspect()`, which returns an object of `{ componentId: line }`.

```js
function fuel(amount = 100) {
  return {
    id: "fuel",
    amount,
    inspect() {
      return `${this.amount.toFixed(0)} L`;
    },
  };
}
```

## Common problems

| Symptom | Likely cause |
| --- | --- |
| An object falls through the floor | The floor needs `area()` **and** `body({ isStatic: true })`. An `area()` alone is a sensor. |
| Nothing collides, no collision events | You started with `physics: false`, or an object is missing `area()`. Press F1 to see the colliders. |
| An object is black | `lighting: "none"` without any light of your own. Add `dirLight()`, `pointLight()`, or use `material({ type: "basic" })`. |
| Text does not show, or sits in the 3D scene | A HUD `text()` needs `fixed()` to be placed in screen pixels. Without it, it floats over its world position. |
| The camera snaps back to the default view | The scene changed: start camera controllers inside the scene. |
| An object disappeared after `go()` | `go()` destroys every object. Create things inside the scene. |
| Keys do nothing | The canvas has no focus (the game is in an iframe, or you clicked outside it). Click the game. |
| No sound | Browsers block audio until the first click or key press. |
| `Error: ... can't add property "x"` | Two components define the same field. The message names both. |

## Headless testing

The engine does not need a browser. With `renderer: "none"` and `loop: "manual"` you get a deterministic simulation that you drive yourself with `k.step(dt)`, which is ideal for unit tests of game logic. In Node (no `document`), the renderer is headless automatically, and the HUD and inputs are inert.

```js
import { expect, test } from "vitest";
import threeplay from "threeplay";

test("the player lands on the floor", async () => {
  const k = threeplay({ global: false, loop: "manual", renderer: "none" });
  await new Promise((resolve) => k.onLoad(resolve)); // wait for Rapier

  k.add([k.box(20, 1, 20), k.pos(0, -0.5, 0), k.area(), k.body({ isStatic: true })]);
  const player = k.add([k.capsule(0.4, 1.6), k.pos(0, 3, 0), k.area(), k.character()]);

  for (let i = 0; i < 100; i++) k.step(1 / 50); // two simulated seconds

  expect(player.isGrounded()).toBe(true);
  expect(player.pos.y).toBeCloseTo(0.8, 1);
  k.quit();
});
```

- `loop: "manual"` stops the `requestAnimationFrame` loop. Each `k.step(dt)` runs one frame: fixed physics steps, updates, timers and rendering (a no-op when headless). `k.step()` without an argument advances one fixed step (1/50 s).
- Use `global: false` in tests so nothing is put on `globalThis`, and call `k.quit()` at the end to free Rapier and cancel listeners.
- Wait for loading before you start (`await new Promise((r) => k.onLoad(r))`), because physics loads asynchronously.
- Simulate input with `k.pressButton("jump")` and `k.releaseButton("jump")`: they take effect at the start of the next `step`. Scene logic, timers, collisions and `k.time()` all behave as in the browser, only faster.

You can use the same setup to run a game on a server, to precompute a level, or to build bots that play your game.

:::tip
`threeplay({ renderer: "none" })` also works in a normal browser page: nothing is drawn, but the game runs. It is useful for measuring logic performance without the cost of rendering.
:::
