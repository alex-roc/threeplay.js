---
title: Getting started
description: Install threeplay, run it with or without a bundler, and build your first 3D game in under 60 lines.
sidebar:
  order: 1
---

threeplay is a tiny 3D game engine for the browser with the feel of [kaplay](https://kaplayjs.com): you describe objects as a list of components (`add([box(), pos(), color("red")])`), tag them, react to events like `onCollide`, split the game into scenes, and write a whole game in one `<script>`. Under the hood it is [three.js](https://threejs.org) (WebGPU with a WebGL2 fallback) for rendering and [Rapier](https://rapier.rs) for physics, and both are one property away when you need them (`obj.object3d`, `k.renderer`, `k.physics.world`).

## Three ways to use it

### 1. npm and a bundler

```sh
pnpm add threeplay three
```

`three` is a peer dependency (r186 or newer), so your project controls its version. Rapier comes with threeplay; it is loaded in the background as its own chunk (and skipped with `physics: false`).

```js
import threeplay from "threeplay";

threeplay({ background: "#87ceeb" });

add([box(2, 2, 2), pos(0, 1, 0), color("tomato")]);
```

Any bundler that understands ES modules works (Vite, esbuild, Rollup, Parcel...).

### 2. No bundler: one HTML file

Save this as `index.html` and open it from any static server. An import map points `threeplay` at the standalone build on a CDN, which has three.js bundled in, so there is nothing else to install.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My first threeplay game</title>
    <script type="importmap">
      {
        "imports": {
          "threeplay": "https://cdn.jsdelivr.net/npm/threeplay/dist/standalone/threeplay.mjs"
        }
      }
    </script>
  </head>
  <body>
    <script type="module">
      import threeplay from "threeplay";

      threeplay({ background: "#87ceeb" });

      // A floor, a box that falls onto it, and a camera that circles around them.
      add([box(10, 0.5, 10), pos(0, -0.25, 0), color("#90be6d"), area(), body({ isStatic: true })]);
      add([box(1, 1, 1), pos(0, 5, 0), rotate(20, 30, 0), color("tomato"), area(), body()]);
      add([text("Hello, threeplay!", { size: 28 }), pos(24, 24), fixed()]);
      orbitCamera({ distance: 9, autoRotate: 15 });
    </script>
  </body>
</html>
```

:::tip
ES module scripts need to be served over HTTP, not opened with `file://`. Any static server does the job: `npx serve .`, `python3 -m http.server`, or the Live Server extension of your editor.
:::

:::note
For anything beyond a demo, pin a version in the URL (`.../npm/threeplay@x.y.z/dist/standalone/threeplay.mjs`) so a new release never changes your game. The standalone build ships a small extra chunk next to `threeplay.mjs` with Rapier. If you copy the build to your own server, copy the whole `standalone/` folder.
:::

### 3. The online playground

Open the [playground](/threeplay.js/playground/) to edit and run code in the browser with no setup at all. It is the quickest way to try the snippets in these docs.

## Your first game

We will build a tiny collectathon: run around a floor, jump, and pick up coins. Every step below adds a few lines to the same `scene`.

### The engine and a scene

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#87ceeb" });
```

`threeplay()` creates the canvas, starts the loop and (by default) puts the whole API on `window`, so you can call `add`, `box`, `onUpdate`... directly. `width` and `height` fix the **logical size** of the game: HUD coordinates are in these units and the canvas is scaled to fit the page, with bars if the aspect ratio differs. Leave them out to fill the window instead.

Games are split in [scenes](/threeplay.js/guides/scenes-and-events/). Everything you create inside a scene is removed when you `go()` to another one.

```js
scene("game", () => {
  // objects and listeners go here
});

go("game");
```

### A floor

```js
add([box(30, 1, 30), pos(0, -0.5, 0), color("#6a994e"), area(), body({ isStatic: true })]);
```

`add()` takes a list of **components**. Here: a `box` shape (width, height, depth in meters), a position (`pos(x, y, z)`: Y is up), a color, an `area()` (gives it a collider) and a static `body()` (it never moves, but things collide with it). The box is 1 m thick and centered at y = −0.5, so its top face sits at y = 0.

### A player

```js
const player = add([
  capsule(0.4, 1.6),
  pos(0, 1.5, 0),
  color("#f77f00"),
  area(),
  character(),
  "player",
]);
```

`character()` turns the capsule into a kinematic character controller: it falls with gravity, slides along walls, climbs small steps and tells you whether it `isGrounded()`. The string `"player"` is a **tag** you can use to find the object or to match collisions.

### Movement

```js
onUpdate(() => player.move(inputDir().multiplyScalar(6)));
```

`inputDir()` reads the arrow keys and WASD (plus the gamepad stick) and returns a unit vector on the ground plane, relative to where the camera looks. `move()` takes a velocity in meters per second and is already scaled by the frame time.

### Jump

```js
onButtonPress("jump", () => player.isGrounded() && player.jump());
```

`"jump"` is a virtual button that exists by default (space bar, gamepad south button). `jump()` sets the vertical speed (8 m/s by default).

### Coins

```js
for (let i = 0; i < 8; i++) {
  add([sphere(0.3), pos(rand(-12, 12), 0.8, rand(-12, 12)), color("gold"), area(), "coin"]);
}

player.onCollide("coin", (coin) => {
  coin.destroy();
  score++;
  hud.text = `Coins: ${score} / 8`;
});
```

An `area()` without a `body()` is a **sensor**: it detects overlaps but nothing bounces off it, which is perfect for pickups. `onCollide(tag, fn)` runs when the player starts touching an object with that tag.

### HUD and camera

```js
const hud = add([text("Coins: 0 / 8", { size: 24 }), pos(20, 16), fixed()]);

camFollow(player, { offset: vec3(0, 6, 9) });
```

`text()` draws DOM text over the game. With `fixed()`, `pos(x, y)` means logical pixels from the top-left corner. `camFollow()` makes the camera chase the player from the given offset.

### The complete game

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#87ceeb" });

scene("game", () => {
  let score = 0;

  // Floor
  add([box(30, 1, 30), pos(0, -0.5, 0), color("#6a994e"), area(), body({ isStatic: true })]);

  // Player
  const player = add([
    capsule(0.4, 1.6),
    pos(0, 1.5, 0),
    color("#f77f00"),
    area(),
    character(),
    "player",
  ]);

  // Coins
  for (let i = 0; i < 8; i++) {
    add([sphere(0.3), pos(rand(-12, 12), 0.8, rand(-12, 12)), color("gold"), area(), "coin"]);
  }

  // HUD and camera
  const hud = add([text("Coins: 0 / 8", { size: 24 }), pos(20, 16), fixed()]);
  camFollow(player, { offset: vec3(0, 6, 9) });

  // Controls
  onUpdate(() => {
    player.move(inputDir().multiplyScalar(6));
    if (player.pos.y < -10) player.teleport(vec3(0, 2, 0)); // fell off the floor
  });
  onButtonPress("jump", () => player.isGrounded() && player.jump());

  // Collecting
  player.onCollide("coin", (coin) => {
    coin.destroy();
    score++;
    hud.text = `Coins: ${score} / 8`;
    beep({ freq: 660 + score * 60, slideTo: 1200 });
    if (score === 8) go("win");
  });
});

scene("win", () => {
  add([text("All coins collected!", { size: 40 }), pos(480, 250), anchor("center"), fixed()]);
  add([text("Press space to play again", { size: 20 }), pos(480, 310), anchor("center"), fixed()]);
  onButtonPress("jump", () => go("game"));
});

go("game");
```

From here, read the guides in order: [game objects](/threeplay.js/guides/game-objects/), [scenes and events](/threeplay.js/guides/scenes-and-events/), [physics](/threeplay.js/guides/physics/), and so on. If you know kaplay, start with [Coming from kaplay](/threeplay.js/guides/coming-from-kaplay/).

## Global mode or not

By default `threeplay()` copies every function onto `window` (`add`, `box`, `pos`, `onUpdate`, `vec3`...) and also exposes the engine as `k`. That is what makes one-file games short, and every example in these docs uses it.

If you prefer to keep the global scope clean (a bigger project, a page with other scripts), turn it off. `threeplay()` returns the engine object and you call everything through it:

```js
import threeplay from "threeplay";

const k = threeplay({ global: false, background: "#222" });

k.scene("main", () => {
  k.add([k.box(1, 1, 1), k.pos(0, 1, 0), k.color("tomato")]);
  k.onKeyPress("space", () => k.camShake());
});

k.go("main");
```

Everything on `k` is also in the [API reference](/threeplay.js/api/).

:::note
Global mode skips a few names that would break the page or the engine's own internals (`window`, `name`, `open`, `focus`...) and the engine fields that only make sense on `k`: `k.root`, `k.opts`, `k.hooks` and `k.plugins`. Use them through `k`.
:::

## TypeScript and editor support

threeplay is written in TypeScript and ships its own types. `add([...])` is typed from its components: `add([pos(), health(3)])` returns an object that has `pos` and `hp`.

In **TypeScript with `global: false`** (or with the global mode off) there is nothing to configure: import what you need and use `k`.

In **global mode**, the editor does not know that `add` or `box` exist on `window`. Add this line at the top of your JavaScript file (it works with VS Code's `// @ts-check` too):

```js
/// <reference types="threeplay/global" />
```

or, in a TypeScript project, once for the whole project in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["threeplay/global"]
  }
}
```

`threeplay/global` declares every global function with the right type, generated from the code itself, so it never goes out of date.
