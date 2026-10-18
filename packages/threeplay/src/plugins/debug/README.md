# debug

The `debug` object (`k.debug`), an inspector panel and an on-screen log. Depends on `render`;
`input` is an **optional** dependency (the `debugKey` toggle needs it, the rest works without it),
and `physics` too (it draws colliders; without it, or with `physics: false`, meshes are outlined).

## API

- `debug.inspect` — toggles the inspector (emits the `"debugInspect"` hook; physics draws
  colliders while it is on, unless `physics: false`: then it outlines meshes). Toggled by `debugKey`
  (default `"f1"`, `false` disables it). The key's browser default (F1 = help on Windows) is
  prevented while the canvas has focus. `threeplay({ debug: true })` starts with it on.
- `debug.paused` ↔ `k.setPaused`, `debug.timeScale` ↔ `k.setTimeScale`.
- `debug.fps()` — smoothed from real frame times (`performance.now()` in `frameStart`), so it
  stays honest while paused. `debug.objectCount()` — live objects.
- `debug.log(...)` / `debug.error(...)` — console plus an on-screen list (bottom-left, newest last,
  each line fades after ~4 s). `debug.clearLog()`.
- `debug.hovered()` — the game object under the mouse (nearest visible hit), or `null`.

## Inspector panel

Top-left, small monospace, semi-transparent, on the render overlay: FPS, object count, renderer
kind, draw calls (`renderer.three.info.render.calls`), and the object under the mouse: id, tags and
each component's `inspect()` line. With no physics plugin installed (or `physics: false`), `Box3Helper` outlines are
drawn around objects that have a `mesh` while inspect is on.

Everything DOM-related is skipped when there is no overlay (headless); the data API
(`fps`, `objectCount`, `paused`, `timeScale`, `inspect`) always works.

## Example

```js
threeplay({ debug: true, debugKey: "f2" });

debug.log("player spawned at", player.pos);
onKeyPress("p", () => { debug.paused = !debug.paused; });
onKeyPress("t", () => { debug.timeScale = debug.timeScale === 1 ? 0.25 : 1; });
```
