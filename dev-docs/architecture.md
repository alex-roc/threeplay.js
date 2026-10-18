# Architecture

threeplay is a small core plus a set of plugins. The core knows nothing about
rendering, physics or input: those are plugins written against the same public
API any contributor uses.

```
packages/threeplay/src/
  index.ts            threeplay(opts): createEngine(defaults + user plugins) + global mode
  globals.ts          copies the API onto window (kaplay-style global mode)
  core/
    types.ts          every core contract (Comp, GameObj, Engine, Plugin, hooks)
    engine.ts         createEngine: loop, scenes, scopes, timers, loading, plugin install
    gameobj.ts        GameObjImpl: components, tags, tree, events
    events.ts         HandlerList / EventEmitter / Scope
    math.ts           vec3, rgb, rand, lerp, easings…
    util.ts           helpers for plugins: self(this), toVec3, targetPos, gameObjOf
  plugins/<name>/
    types.ts          the plugin's public contract (API + options + hooks), merged into
                      the core types through declaration merging
    index.ts          definePlugin({ name, dependencies, install(k) { … return api } })
    *.ts              implementation
    <name>.test.ts    tests
```

## The core

- **Object tree.** Every game object owns a `THREE.Object3D` (`obj.object3d`).
  Children objects nest their node inside the parent's, so the three.js scene
  graph *is* the object tree. `k.root.object3d` lives in `k.scene3d`.
- **Components** are plain objects. `use()` copies their own property
  descriptors (fields, methods, getters/setters) onto the object; lifecycle keys
  (`id require add update fixedUpdate destroy inspect`) are not copied but called
  with `this` bound to the object. A property clash throws an error naming both
  owners. Same `id` = replacement. `require` is checked after the whole `add([...])`.
- **Loop.** `frame(dt)`: pending `go()` → `frameStart` hook → fixed steps
  (`beforeFixedUpdate`, objects' `fixedUpdate`, `afterFixedUpdate`; 50 Hz,
  max 5 substeps) → `beforeUpdate`, objects' `update`, `onUpdate` handlers and
  timers, `afterUpdate` → `render(alpha)` → `frameEnd`. `dt` is clamped to `maxDt`
  (0.1 s). `loop: "manual"` + `k.step(dt)` drives it deterministically (tests).
- **Listener scopes.** A listener registered while a scene body or one of its
  frames runs belongs to that scene and is cancelled by `go()`. A listener
  registered outside (top-level code, plugin `install`) is global and persists.
  This fixes kaplay's gotcha where `go()` also removed top-level listeners.
- **Hooks** (`k.hooks.on/emit`) are system events for plugins; never scoped.
  Plugins add hooks by augmenting `EngineHooks`.
- **Loading.** `k.load(promise)` registers a task; scenes start only after every
  task settles (a failed task is logged, not fatal). `go()` before that is queued.
- **`go()` inside a frame** is deferred to the start of the next frame; outside a
  frame (setup code) it runs at once if loading is done.

## Plugins

```ts
export const myPlugin = definePlugin<MyAPI>({
  name: "my",
  dependencies: ["transform"],          // installed before, or install throws
  install(k) {
    k.hooks.on("afterUpdate", (dt) => { /* system logic */ });
    return { myComp, myFunction };       // merged into k (and window in global mode)
  },
});
```

- `install` is synchronous; async work goes through `k.load()`. Functions must be
  closures (no `this`): they are copied to `window` in global mode.
- A key already defined by the core or another plugin throws at install.
- Types: `types.ts` augments `PluginRegistry` (API), `ThreeplayOpts` (options) and
  optionally `EngineHooks`. `Engine` is the intersection of all registered APIs.
- Plugins never import each other's implementation. They may import other
  plugins' **types** and call other plugins' APIs through `k` (declare them in
  `dependencies`). Shared contracts live in the owner's `types.ts`:
  - `ShapeDesc` / `ShapeComp` (shapes): any visual component exposes `obj.shape`
    and `obj.mesh`; physics derives colliders from `shape`.
  - `MoveHandler` (transform): a component that defines `applyMove(delta, vel)`
    receives `pos.move()` calls (character controller, bodies).
  - `RendererBackend` (render), `PhysicsBackend` (physics): swap the engine below.
  - `debugInspect` hook (debug): physics draws colliders while it is on.
  - `color`/`opacity` comps expose `obj.color` / `obj.opacity`; the HUD reads them.

## Built-in plugins and install order

`render → transform → shapes → physics → input → camera → hud → assets → audio
→ level → gameplay → debug`. Hooks run in install order, so physics' `afterUpdate`
(character controllers) runs before the camera's. `threeplay({ core: [...] })` replaces the list
(e.g. a headless server without render/input/audio).

## Builds

- `dist/threeplay.js` (npm): ESM, `three` external (peer), Rapier external.
- `dist/standalone/threeplay.mjs`: three bundled, Rapier as a lazy chunk next to
  it. Copy the whole folder to vendor it.
- `dist/types`: declarations. `types/global.d.ts` types the global mode.

## Conventions

- Units: meters, Y up, angles in degrees in the public API (radians inside three).
- Errors say what to do ("Add pos() too"), naming components and plugins.
- Every public function has TSDoc: the API reference is generated from it.
