# assets

Loading and instancing glTF models and textures. Depends on `transform`.

Every `load*` call goes through `k.load()`, so the first scene waits for it (a failed load is
logged by the core, not fatal).

## API

- `loadRoot(path?)` — URL prefix for relative paths (`loadRoot("assets/")`); returns the current one.
  Absolute URLs (`http:`, `/`, `data:`, `blob:`) are never prefixed.
- `loadModel(name, url)` — glTF/GLB via `GLTFLoader`. `loadTexture(name, url)` — sRGB, repeat wrapping.
- `defineModel(name, scene, animations?)` — register a procedurally built or already parsed model
  (no network; handy in tests).
- `getModel(name)`, `getTexture(name)`.
- `model(name, opts)` — component (id `"shape"`, `shape: { kind: "model" }`, `mesh` = the instance
  root, a child of `object3d`). Throws if the model is not loaded. Options: `scale`, `shadows`
  (default `true`), `groundAlign`, `anim` (start looping), `faceForward` (default `true`),
  `uniqueMaterials` (default `false`; adding `color()` or `opacity()` to a model clones its
  materials automatically, see Notes).
- Animations: `anims`, `playAnim(name, { loop = true, speed = 1, fade = 0.2 })` (cross-fades;
  calling it again for the running animation only updates the speed), `stopAnim()`, `curAnim()`,
  `onAnimEnd(fn)` (object event `"animEnd"`, for non-looping animations), `mixer`.
  Unknown animation names throw, listing the available ones.

## Notes

- glTF faces **+Z**, the engine's forward is **−Z**: `faceForward` turns the instance 180° around Y
  so the model faces `forward()`. Pass `faceForward: false` for models authored facing −Z.
- Instances are `SkeletonUtils.clone`s: geometry and materials are shared with the template.
  Adding `color()` or `opacity()` to a model instance clones its materials first (as
  `uniqueMaterials: true` would), so tinting or fading one instance never changes the others or the
  template; instances without them keep sharing. The clones are disposed with the object
  (textures stay shared with the template).
- The mixer ticks in the component's `update()` with `k.dt()`, so paused objects freeze.

## Example

```js
loadRoot("assets/");
loadModel("knight", "knight.glb");
loadTexture("grass", "grass.png");

scene("main", () => {
  const knight = add([pos(0, 0, 0), model("knight", { scale: 1.5, groundAlign: true, anim: "idle" })]);
  knight.onAnimEnd((name) => name === "attack" && knight.playAnim("idle"));
  onKeyPress("space", () => knight.playAnim("attack", { loop: false }));
});
```
