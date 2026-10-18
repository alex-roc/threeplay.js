# Gotchas

Things learned the hard way while building threeplay. Add to this list when
you hit something non-obvious.

## Core

- `k.dt()` is clamped to `maxDt` (0.1 s). Tests that step more than 0.1 s per
  frame need `createEngine({ maxDt: 1 })`.
- Pressed/released input sets are cleared at `frameEnd`: in tests read
  `isKeyPressed()` inside `k.onUpdate`, not after `k.step()`.
- `Comp.id` is a lifecycle key, so `MergeComps` strips it. `GameObj<MyComp>` with
  `id: "literal"` collapses to `never` (it clashes with `GameObjRaw.id: number`):
  write `GameObj<MergeComps<MyComp>>`.
- `add()` takes `readonly [...T]` (variadic tuple) on purpose: with a plain array
  type, TypeScript normalizes object literals with different fields into a union
  whose intersection is `never`.
- Initial-state handlers (`state()`) must fire on the first `update()`, not in
  `add()`: `add()` runs inside `root.add()`, before the caller can register them.
- Awaiting a timer takes a few microtask ticks: tests should `await` a `setTimeout`.
- `window?.x` throws in Node when `window` doesn't exist: use `typeof window`.

- Relative imports carry a `.js` extension (`from "./engine.js"`), and the package
  typechecks with `moduleResolution: NodeNext`: extensionless specifiers in the emitted
  `.d.ts` don't resolve for NodeNext consumers, so the plugins' `declare module`
  augmentations silently vanish and `threeplay({ width })` becomes a type error.

## three.js (r186)

- `PCFSoftShadowMap` was removed (both renderers warn and use `PCFShadowMap`).
- `WebGPURenderer.render()` throws until `await renderer.init()` finished.
- `WebGPURenderer` falls back to WebGL2 by itself; `renderer.backend.isWebGPUBackend`
  tells which one runs. Headless Chrome with SwiftShader has no WebGPU adapter.
- Create renderers with `alpha: true` (it can't change later) and use
  `setSize(w, h, false)` so three doesn't overwrite the canvas CSS.
- A WebGPU canvas is cleared after presenting: `screenshot()` re-renders and
  calls `toDataURL` in the same task.
- Lights are physical: point/spot lights need intensities in the tens or hundreds.
- `Raycaster` uses `matrixWorld`, refreshed only at render: call
  `root.updateMatrixWorld()` before picking. It doesn't skip invisible objects.
- `Box3.setFromObject` on a scaled root gives a box in the parent's space.
- Animations: don't `reset()` the clip that is already playing; cross-fade only
  from a running action; `LoopOnce` needs `clampWhenFinished`.
- `0–255` colors must be built with `setRGB(..., SRGBColorSpace)`; `new Color(r, g, b)`
  is linear and looks washed out next to hex colors.

## Rapier (0.21, compat build)

- `await import("@dimforge/rapier3d-compat")` then `await R.init()` (no args). In
  Node the namespace may be CJS: `mod.init ? mod : mod.default`.
- Plain `{x,y,z}` / `{x,y,z,w}` work everywhere; most getters allocate unless
  given a target.
- Every collider needs `ActiveEvents.COLLISION_EVENTS`, and
  `ActiveCollisionTypes.ALL` so kinematic/fixed/sensor pairs report. Events for a
  removed collider can arrive a step late: ignore unmapped handles.
- `world.contactPair(c1, c2, (manifold, flipped))`: normal points c1→c2; negate
  when flipped. Sensors have no manifold.
- Character controller: after `setTranslation`, call
  `world.propagateModifiedBodyPositionsToColliders()` before
  `computeColliderMovement`, or frames without a fixed step collide against stale
  positions. Use `QueryFilterFlags.EXCLUDE_SENSORS`. Autostep with a capsule
  needs `minWidth` ≥ 0.1.
- `addForce` persists until `resetForces`. Angular velocity is rad/s in Rapier
  (degrees/s in our API). Capsule `halfHeight` is the cylinder part only.
- `debugRender()` colors are RGBA (4 floats per vertex).
- Dynamic bodies are rendered **interpolated** between the last two fixed steps:
  physics writes the true pose to `object3d` after each step (for `fixedUpdate` and
  collision callbacks) and the interpolated one in `beforeUpdate`. Its fraction mirrors
  the core's accumulator (`frameStart` adds `dt`, `afterFixedUpdate` subtracts a step,
  and a frame of 5 steps resets it: keep `CORE_MAX_SUBSTEPS` in sync with `frame()`).
  "Code moved the object" is detected by comparing the node with what physics last wrote
  (`lastPos`/`lastQuat`), so any new place that writes poses must update them (see `place()`).
- Mutually exclusive components declare `conflicts: ["other"]` (checked both ways
  before any property is merged): `body()` and `character()` use it.

## WebAudio

- `AudioBufferSourceNode` starts once: pause = stop + a new source at the saved
  offset (detach `onended` first).
- Touch `pointerdown` is not a user activation; `pointerup`/`touchend`/`click` are.
- Don't create the `AudioContext` while loading: it stays suspended and warns. `loadSound` decodes
  with an `OfflineAudioContext`; the real context appears on the first `play()`/`beep()`.

## Tooling

- Agent worktrees live under `.claude/worktrees/` *inside* the repo: their
  `node_modules` can end up linked to the root one and a `pnpm install` there
  disturbs the root. Prefer `CI=true pnpm install` in the worktree and avoid pnpm
  commands at the root while agents run; afterwards `rm -rf node_modules && CI=true pnpm install`.
- Without `CI=true`, pnpm 11 aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`
  when it wants to recreate `node_modules`.
- Vitest hides `console.log` unless `--silent=false`.
- happy-dom: opt in per file with `// @vitest-environment happy-dom`.
- Smoke tests: the first page of a headless browser reports the favicon 404 as a
  console error; examples declare `<link rel="icon" href="data:,">`.
- Site: see `dev-docs/site.md`.
