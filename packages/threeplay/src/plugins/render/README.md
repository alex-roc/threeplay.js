# render

The three.js renderer, the canvas layout, the HUD overlay and the default lighting.

## What it does

- **Backends**, each in its own file and loaded with a dynamic `import()` (own chunk):
  `"auto"` / `"webgpu"` (`WebGPURenderer`, falls back to WebGL2 by itself), `"webgl"`
  (`WebGLRenderer`, `preserveDrawingBuffer` so `screenshot()` works) and `"none"` (headless;
  also chosen automatically when there is no `document`).
- **Layout**: the canvas is created synchronously in `install` (`k.canvas`). With `width` and
  `height` the logical size is fixed and the canvas CSS box is exactly the drawn area, centered
  with letterbox bars; without them the canvas fills the container and logical size = CSS size.
- **Overlay**: a DOM layer over the canvas in logical units (`k.overlay()`), used by the HUD.
- **Default lighting**: hemisphere light plus a shadow-casting sun that follows the camera.
- **Loading bar** on the overlay until `k.isLoaded()`.

## API

| | |
| --- | --- |
| `renderer` | the backend (`renderer.three` is the raw three.js renderer) |
| `canvas` | the game canvas (`null` when headless) |
| `width()`, `height()`, `center()` | logical size |
| `viewScale()` | CSS px per logical unit (horizontal: with `letterbox: false` Y differs, use `canvas.getBoundingClientRect().height / height()`) |
| `setSunDirection(dir)` | re-aims the default sun (direction the light travels); shadows keep following the camera |
| `overlay()` | DOM layer in logical units (`null` when headless) |
| `toScreen(world)`, `screenRay(screen)` | projection in logical coordinates |
| `setBackground(c)`, `getBackground()`, `setFog(opts)` | scene look |
| `sun`, `ambient` | the default lights (`null` with `lighting: "none"`). The sun's `position`/`target` are rewritten every frame to follow the camera: use `setSunDirection()` to change where it shines from |
| `screenshot()` | PNG data URL |
| `onResize(fn)` | logical size or scale changed (scene-scoped like other listeners) |
| `pointLight()`, `spotLight()`, `dirLight()` | light components |

Options: `width`, `height`, `letterbox`, `canvas`, `root`, `background`, `renderer`,
`pixelRatio`, `antialias`, `shadows`, `lighting` (see `types.ts`).

## Example

```js
const k = threeplay({ width: 960, height: 540, background: "#222" });

k.scene("main", () => {
  k.add([k.pos(0, 2, 0), k.pointLight({ color: "orange", intensity: 30 })]);
  const ray = k.screenRay(k.center());   // ray through the middle of the screen
});
```

## Notes

- `k.camera3d.aspect` follows the drawn area (also if you replace `k.camera3d`).
- `render()` on a WebGPU renderer throws until `init()` has finished, so the backend proxy
  swallows frames until it is ready; the engine only starts scenes after loading anyway.
- `PCFSoftShadowMap` was removed in three r18x: the backends use `PCFShadowMap`.
- Pure helpers (`layout.ts`, `project.ts`, `lighting.ts`) are unit-tested in Node.
