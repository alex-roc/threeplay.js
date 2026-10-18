# shapes

Primitive shapes and the components that give them a look. Depends on `transform`.

## What it does

- `box`, `sphere`, `capsule`, `cylinder`, `cone`, `plane`, `mesh`: a `THREE.Mesh` that is a
  **child of `object3d`** (so `scale` applies). They expose `obj.shape` (a `ShapeDesc`, which
  physics reads) and `obj.mesh`. Default material: `MeshStandardMaterial` `0xdddddd`, roughness 0.8;
  shadows cast and receive by default. Geometry and material are disposed on destroy, except what
  you pass to `mesh()`.
- `color()`: `obj.color` is a `THREE.Color` **shared with the material**, so
  `obj.color.set("red")` just works, and so does `obj.color = "red"` (the setter copies). Works in
  any order inside `add([...])`. On objects without a mesh (HUD) it is just the field the HUD reads.
- `opacity()`: `obj.opacity` is synced to the material every frame (`transparent` while < 1);
  `fadeOut(seconds, destroy?)`.
- `material()`: replaces the mesh material (`standard`, `basic`, `toon`, `lambert`, `phong`) or takes
  a `THREE.Material`. `map` as a string is resolved lazily through the assets plugin, if installed.

## API

`box(w, h, d)` (`box(n)` is a cube) · `sphere(r)` · `capsule(r, totalHeight)` · `cylinder(r, h)` ·
`cone(r, h)` · `plane(w, d)` (a floor on XZ facing up) · `mesh(geometry, material?)` ·
`color(...)` (`"#f00"`, `"tomato"`, `255, 0, 0`, `[255, 0, 0]`) · `opacity(v)` · `material(opts)`.

## Example

```js
k.add([k.pos(0, 1, 0), k.sphere(1), k.color("tomato"), k.opacity(1)]);
const floor = k.add([k.plane(50), k.material({ map: "grass", repeat: 10 })]);
ball.fadeOut(0.5, true);   // fade, then destroy
```

## Notes

- A `repeat` clones the texture, so the shared one is never modified.
- `transparent` is only raised while opacity < 1; a material that was transparent keeps being so.
