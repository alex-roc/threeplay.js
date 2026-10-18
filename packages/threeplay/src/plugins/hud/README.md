# hud

Text and rectangles drawn as DOM elements on the render overlay. Depends on `render` and `transform`.

## What it does

- `text(str, opts)` and `uiRect(w, h, opts)` create elements in `k.overlay()`. Any font and any
  character works; style the element through `obj.el` if you need more. Headless (no overlay)
  `el` is `null` and the fields (`obj.text`, `obj.width`, ...) keep working.
- With `fixed()` the element sits at `obj.pos.x / obj.pos.y`: logical pixels from the top-left
  (`pos` is optional, default `(0, 0)`). Without it the element floats over the object's world
  position (projected with `k.toScreen`, hidden behind the camera).
- `anchor(a)` says which point of the element `pos` refers to (default `"topleft"`).
- Each frame (render hook) the element follows `pos`, `hidden` (also of its ancestors), `obj.color`
  and `obj.opacity` when present. Writes are skipped when nothing changed.

## API

`text(str, { size, font, width, align, weight, outline })` · `uiRect(w, h, { radius, outline })` ·
`fixed()` · `anchor(a)` · `worldToHud(v)` (same as `k.toScreen`).

Fields: `obj.text`, `obj.textSize`, `obj.width`, `obj.height` (setters update the element), `obj.el`.

## Example

```js
const score = k.add([k.text("score: 0", { size: 24 }), k.fixed(), k.pos(16, 16)]);
score.text = "score: 10";

const bar = k.add([k.uiRect(200, 16), k.fixed(), k.pos(k.width() - 16, 16),
                   k.anchor("topright"), k.color("limegreen")]);
bar.width = 200 * (hp / maxHp);

k.add([k.text("enemy", { size: 12 }), k.pos(3, 2, 0), k.anchor("bot")]);  // floats over the world
```

## Notes

- Elements are created with `display: none` and revealed by the first frame, so nothing flashes at
  `(0, 0)`.
- Placement, anchors and the style diffing are pure functions (`placement.ts`), tested in Node.
