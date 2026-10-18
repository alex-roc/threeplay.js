---
title: Writing plugins
description: Add components, functions and systems to the engine with definePlugin, hook into the frame loop, type your API, pick the built-in plugins, and publish.
sidebar:
  order: 13
---

threeplay is a small core plus plugins, and the built-in features (rendering, physics, input, HUD...) are plugins written against the same API you get. A plugin adds **components**, **functions** and **systems** to the engine. Use one when something belongs in more than one game, or when you want a clean place to keep related code.

If you only need a component for your own game, a plain function that returns an object is enough (see [Game objects](/threeplay.js/guides/game-objects/)). Reach for a plugin when you want to share it, add engine-level functions, or run logic every frame.

## A complete plugin

This one adds a `bob` component, a `confetti()` function, and uses other built-in components. Click the spheres.

```js
import threeplay, { definePlugin } from "threeplay";

const partyPlugin = definePlugin({
  name: "party",
  dependencies: ["transform", "shapes", "gameplay"], // installed before this one, or install() throws
  install(k) {
    /** Component: floats up and down. */
    function bob(height = 0.3, speed = 2) {
      let base = null;
      return {
        id: "bob",
        require: ["pos"],
        update() {
          base ??= this.pos.y;
          this.pos.y = base + Math.sin(k.time() * speed) * height;
        },
      };
    }

    /** Spawns colorful particles that fly out and fade away. */
    function confetti(at, count = 40) {
      for (let i = 0; i < count; i++) {
        const vel = k.vec3(k.rand(-4, 4), k.rand(4, 9), k.rand(-4, 4));
        k.add([
          k.box(0.12, 0.12, 0.04),
          k.pos(at),
          k.rotate(k.rand(360), k.rand(360), 0),
          k.color(k.choose(["#ff006e", "#fb5607", "#ffbe0b", "#3a86ff", "#8338ec"])),
          k.opacity(1),
          k.lifespan(1.5, { fade: 0.7 }),
          {
            update() {
              vel.y -= 15 * k.dt();
              this.move(vel);
              this.rot.x += 400 * k.dt();
            },
          },
        ]);
      }
    }

    return { bob, confetti }; // merged into k (and into window in global mode)
  },
});

threeplay({ width: 960, height: 540, background: "#22223b", plugins: [partyPlugin] });

scene("main", () => {
  add([plane(20), color("#4a4e69")]);
  for (let i = 0; i < 5; i++) {
    add([sphere(0.6), pos(-6 + i * 3, 1.5, 0), color("#c9ada7"), bob(0.4, 1.5 + i * 0.3), "balloon"]);
  }
  camPos(0, 4, 10);
  camLookAt(vec3(0, 1.5, 0));
  onClick("balloon", (b) => {
    confetti(b.worldPos());
    beep({ freq: rand(500, 900), slideTo: 1400, duration: 0.15 });
  });
});

go("main");
```

## Anatomy of a plugin

```js
const myPlugin = definePlugin({
  name: "my",                       // unique; the API is also at k.plugins.my
  dependencies: ["transform"],      // optional: plugins that must be installed before
  install(k) {
    // set things up, register hooks...
    return { myComp, myFunction };  // the API
  },
});

threeplay({ plugins: [myPlugin] });
```

- `install(k)` receives the engine and runs **synchronously**, once. Plugins you pass in `plugins` are installed after the built-in ones, in order.
- Whatever it returns is merged into `k` (and onto `window` in global mode). Functions must be **closures that don't use `this`**, because they are copied around.
- A key already defined by the core or another plugin makes `threeplay()` throw, naming both: `Plugin "party" can't define "box": it is already defined by plugin "shapes".` Pick distinctive names.
- `dependencies` lists plugin **names** that must come first. If one is missing, `install` is not called and an error says which.
- Use the other plugins through `k` (`k.add`, `k.box`, `k.onUpdate`, `k.hooks`...). Don't import their source code.

A plugin can also be just a function, the kaplay style, when it needs no name or dependencies:

```js
threeplay({
  plugins: [
    (k) => ({
      shout: (msg) => k.debug.log(msg.toUpperCase()),
    }),
  ],
});
```

### Options

Plugins read their configuration from the options of `threeplay()`:

```js
install(k) {
  const max = k.opts.party?.maxConfetti ?? 100;
  // ...
}

threeplay({ plugins: [partyPlugin], party: { maxConfetti: 20 } });
```

### Cleanup and loading

```js
install(k) {
  const timer = setInterval(sync, 1000);
  k.onQuit(() => clearInterval(timer));          // runs on k.quit()

  k.load(fetch("data.json").then((r) => r.json()));   // delays the first scene until it settles
}
```

Listeners you register in `install` are global: they survive `go()` (see [Scenes and events](/threeplay.js/guides/scenes-and-events/#listener-scopes)).

## Hooks: running logic every frame

`k.hooks.on(name, fn)` is how plugins run **systems**. Hooks are not game events: they are never cleared by `go()`, and they run in plugin install order (so the physics plugin's `afterUpdate` runs before the camera's, and the camera sees the final positions).

```js
install(k) {
  k.hooks.on("afterUpdate", (dt) => {
    for (const obj of k.get("magnet")) pull(obj, dt);
  });
  k.hooks.on("sceneEnter", (name, args) => resetScore());
}
```

| Hook | Arguments | When it runs |
| --- | --- | --- |
| `init` | | Once, after every plugin is installed. |
| `loaded` | | Every `load()` finished; the first scene is about to start. |
| `frameStart` | `dt` | Start of a frame, after a pending `go()` took effect. Input is processed here. |
| `beforeFixedUpdate` | `fixedDt` | Before each fixed step's `fixedUpdate` code (e.g. push kinematic bodies to the physics world). |
| `afterFixedUpdate` | `fixedDt` | After each fixed step's `fixedUpdate` code (e.g. step the physics world). |
| `beforeUpdate` | `dt` | Before objects' `update`. |
| `afterUpdate` | `dt` | After objects' `update` and timers (e.g. move characters and the camera). |
| `render` | `alpha` | Time to draw. `alpha` is the fraction of a fixed step left over. |
| `frameEnd` | | End of the frame (e.g. clear "pressed this frame" input). |
| `sceneEnter` | `name, args` | A scene is about to start, after the previous scene's objects and listeners were cleared. |
| `sceneLeave` | `name` | A scene is ending (its objects are about to be destroyed). Also emitted on `quit()`. |
| `objectAdd` | `obj` | An object entered the tree, after its components' `add()`. |
| `objectDestroy` | `obj` | An object is being destroyed, before its three.js node is detached. |
| `debugInspect` | `enabled` | The inspector was switched on or off (added by the debug plugin). |

While the game is paused, the fixed and update hooks (`beforeFixedUpdate`, `afterFixedUpdate`, `beforeUpdate`, `afterUpdate`) are not emitted, but `frameStart`, `render` and `frameEnd` still are. `k.hooks.on` returns a controller with `cancel()`, like any listener, and `k.hooks.emit(name, ...args)` lets a plugin emit its own hooks (declare their types as shown below).

Here is a plugin that is all system, a score that resets with each scene and shows itself on the HUD:

```js
const scorePlugin = definePlugin({
  name: "score",
  dependencies: ["hud"],
  install(k) {
    let value = 0;
    let label = null;

    k.hooks.on("sceneEnter", () => {
      value = 0;
      label = k.add([k.text("Score: 0", { size: 24 }), k.pos(20, 16), k.fixed()]);
    });

    return {
      addScore(n = 1) {
        value += n;
        if (label?.exists()) label.text = `Score: ${value}`;
      },
      getScore: () => value,
    };
  },
});
```

## Typing a plugin

If you write TypeScript, or want editor completion in JavaScript, use declaration merging so that `k.bob()` is typed. Declare the API, and optionally your options and hooks:

```ts
import { definePlugin, type Comp } from "threeplay";

interface PartyAPI {
  bob(height?: number, speed?: number): Comp & { id: "bob" };
  confetti(at: { x: number; y: number; z: number }, count?: number): void;
}

export const partyPlugin = definePlugin<PartyAPI>({
  name: "party",
  dependencies: ["transform", "shapes"],
  install(k) {
    const max = k.opts.party?.maxConfetti ?? 100;
    return {
      bob: (height = 0.3, speed = 2) => ({ id: "bob" as const, update() { /* ... */ } }),
      confetti(at, count = 40) {
        k.hooks.emit("confettiBurst", Math.min(count, max));
        /* ... */
      },
    };
  },
});

declare module "threeplay" {
  interface PluginRegistry {
    party: PartyAPI; // adds bob() and confetti() to the engine type
  }
  interface ThreeplayOpts {
    party?: { maxConfetti?: number }; // adds an option to threeplay({ ... })
  }
  interface EngineHooks {
    confettiBurst: [count: number]; // adds a typed hook
  }
}
```

`Engine` (the type of `k`) is the core API merged with every `PluginRegistry` entry, so after this `k.bob`, `threeplay({ party: ... })` and `k.hooks.on("confettiBurst", ...)` are all typed. For global mode, `threeplay/global` declares the globals of the built-in plugins only. Add yours in a `.d.ts` file of your project, for example `declare const bob: import("threeplay").Engine["bob"];`.

## Contracts shared between plugins

Plugins talk through small interfaces, so that you can build on them or replace a built-in without touching the rest:

| Contract | What it means |
| --- | --- |
| `ShapeComp` (`shape`, `mesh`) | A component that makes an object visible exposes `obj.shape` (a description such as `{ kind: "box", width, height, depth }`) and `obj.mesh` (the three.js object, a child of `obj.object3d`). Physics builds colliders from `shape`; the debug inspector and `onClick` use `mesh`. `box()`, `sphere()`, `model()`... all follow it. |
| `MoveHandler` (`applyMove(delta, vel)`) | A component that defines `applyMove` receives the calls to `obj.move()` instead of `pos` changing directly. `character()` and `body()` do. Define it to build your own controller. |
| `obj.color`, `obj.opacity` | `color()` and `opacity()` expose these fields. The HUD reads them to style its elements, so any component can provide them. |
| `RendererBackend` | What the render plugin needs from a three.js renderer: `init`, `setSize`, `render`, `dispose`. |
| `PhysicsBackend` | What the physics plugin needs from a physics engine (`init`, `step`, gravity...). Marked unstable. |
| `debugInspect` hook | Emitted when the inspector toggles. The physics plugin draws colliders while it is on; do the same for your own overlays. |

## Choosing the built-in plugins

`threeplay()` installs all built-in plugins unless you pass `core`, which **replaces** the list:

```js
import threeplay, {
  transformPlugin,
  shapesPlugin,
  physicsPlugin,
  gameplayPlugin,
} from "threeplay";

// A headless simulation (a server, a bot): no rendering, input, HUD, audio or camera.
const k = threeplay({
  global: false,
  loop: "manual",
  core: [transformPlugin, shapesPlugin, physicsPlugin, gameplayPlugin],
});
```

The built-in plugins, in install order, with what they need:

| Plugin | Depends on | Adds |
| --- | --- | --- |
| `renderPlugin` | | renderer, canvas, lights, background and fog, `toScreen` |
| `transformPlugin` | | `pos`, `rotate`, `scale`, `follow` |
| `shapesPlugin` | `transform` | primitives, `color`, `opacity`, `material` |
| `physicsPlugin` | `transform` | `area`, `body`, `character`, `raycast`, gravity |
| `inputPlugin` | `render` | keyboard, mouse, touch, gamepad, buttons |
| `cameraPlugin` | `render`, `transform`, `input` | camera controllers |
| `hudPlugin` | `render`, `transform` | `text`, `uiRect`, `fixed`, `anchor` |
| `assetsPlugin` | `transform` | `loadModel`, `loadTexture`, `model` |
| `audioPlugin` | | `loadSound`, `play`, `beep` |
| `levelPlugin` | `transform` | `addLevel` |
| `gameplayPlugin` | | `health`, `state`, `lifespan`, `timer`, `offscreen` |
| `debugPlugin` | `render` | the `debug` object and inspector |

Keep them in this order and keep the dependencies installed first. Everything in `defaultPlugins` is exported too, so `core: [...defaultPlugins.filter(...)]` works. To replace one (your own physics, say), leave it out of `core` and install a plugin with the same `name` and API in its place, so that plugins that depend on it keep working.

## Publishing a plugin

Share a plugin as an npm package named `threeplay-plugin-<something>`:

- Export the plugin object (`export default partyPlugin`), and your types, including the `declare module "threeplay"` block.
- Declare `threeplay` as a **peer dependency** (and `three` if you use it directly), so your plugin uses the user's engine, not its own copy.
- Add `threeplay-plugin` to `keywords` so people can find it.
- Choose distinctive names for what you add to the engine (a short prefix helps: `partyBob`, `partyConfetti`). Two plugins that define the same name make `threeplay()` throw.

Users then install and use it like this:

```js
import threeplay from "threeplay";
import party from "threeplay-plugin-party";

threeplay({ plugins: [party] });
```

The built-in plugins are just the ones most games need, and nothing stops a package from doing more than the built-ins do: a different physics engine, a dialogue system, a procedural level generator, a networking layer.
