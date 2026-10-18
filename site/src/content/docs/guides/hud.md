---
title: HUD and text
description: Score counters, bars and labels drawn as DOM elements over the game, fixed to the screen or floating over 3D objects.
sidebar:
  order: 8
---

The HUD is made of ordinary game objects that draw **DOM elements** on top of the canvas. That means any font, any character (emoji included), crisp text at any resolution, and full CSS styling when you want it. There are two components, `text()` and `uiRect()`, and two helpers that place them, `fixed()` and `anchor()`.

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#1b1b2f" });

scene("main", () => {
  add([plane(30), color("#33415c")]);

  const enemy = add([capsule(0.4, 1.6), pos(0, 0.8, -4), color("crimson"), health(5), "enemy"]);
  // No fixed(): this label floats over the enemy's position in the world.
  enemy.add([text("Goblin", { size: 14, weight: "bold" }), pos(0, 1.3, 0), anchor("bot")]);

  // Fixed to the screen: pos is in logical pixels from the top-left corner.
  const score = add([text("Score: 0", { size: 24 }), pos(20, 16), fixed()]);
  add([text("HP", { size: 16 }), pos(20, 54), fixed()]);
  add([uiRect(204, 20, { radius: 5 }), color("#111"), pos(50, 52), fixed()]);   // frame
  const bar = add([uiRect(200, 16, { radius: 3 }), color("limegreen"), pos(52, 54), fixed()]);
  add([
    text("Press space to hurt the goblin", { size: 20, align: "center" }),
    pos(width() / 2, height() - 20),
    anchor("bot"),
    fixed(),
  ]);

  let points = 0;
  enemy.onHurt(() => {
    points += 10;
    score.text = `Score: ${points}`;
    bar.width = 200 * (enemy.hp / enemy.maxHp); // setters update the element
  });
  enemy.onDeath(() => enemy.destroy());
  onButtonPress("jump", () => enemy.exists() && enemy.hurt(1));
});

go("main");
```

## `text()`

```js
const label = add([text("Hello", { size: 24, weight: "bold" }), pos(20, 20), fixed()]);

label.text = "Score: 10";   // changes the text (numbers work too)
label.textSize = 32;
```

| Option | Default | Meaning |
| --- | --- | --- |
| `size` | `16` | Font size, in logical pixels. |
| `font` | `system-ui, sans-serif` | Any CSS font family. |
| `width` | none | Wrap the text at this width, in logical pixels. Without it the text stays on the lines you wrote (`\n` works). |
| `align` | `"left"` | `"left"`, `"center"` or `"right"` (matters for several lines). |
| `weight` | `"normal"` | `"normal"`, `"bold"` or a number such as `600`. |
| `outline` | `true` | A dark outline and shadow so the text reads over any 3D background. |

Text is white. Use `color()` to change it: `add([text("Danger", { size: 30 }), color("red"), pos(20, 60), fixed()])`. `text()` accepts a string or a number.

## `uiRect()`

A rectangle for bars, panels and backgrounds. It is white until you give it a `color()`.

```js
const panel = add([uiRect(300, 120, { radius: 8, outline: "#fff" }), color("#000"), opacity(0.6), pos(20, 20), fixed()]);
panel.width = 400;
```

Options are `radius` (corner radius in pixels) and `outline` (a CSS color for a 2 px border). Both `width` and `height` are fields you can assign.

## `fixed()`: screen space or world space

- With **`fixed()`**, the element sits at `pos(x, y)`: **logical pixels from the top-left** corner. The `z` is ignored, and `pos()` is optional (the default is `(0, 0)`).
- **Without `fixed()`**, the element floats over the object's **world position**, projected onto the screen every frame. It hides when the position is behind the camera. Walls do not hide it.

World-space labels are the easy way to put a name or an icon over a 3D thing. Make them **children** of the object so they move with it, and give them a local `pos` to lift them up:

```js
enemy.add([text("!", { size: 30 }), color("yellow"), pos(0, 1.5, 0), anchor("bot")]);
```

When the object is destroyed, so is its label.

## `anchor()`

`anchor(a)` says which point of the element `pos` refers to. The default is `"topleft"`.

```
topleft      top      topright
left       center        right
botleft       bot      botright
```

```js
add([text("Paused", { size: 40 }), pos(480, 270), anchor("center"), fixed()]);   // centered on the screen
add([text("Score: 0"), pos(width() - 20, 16), anchor("topright"), fixed()]);      // flush right
```

An unknown anchor name throws with the list of valid names.

## Coordinates and screen size

HUD coordinates are in **logical pixels**. With `threeplay({ width: 960, height: 540 })` the screen is always 960 by 540 logical pixels, however big the window is, and everything scales together. Layouts are simple: `pos(480, 270)` is always the center.

Without `width` and `height` the game fills the window and the logical size is the window size in CSS pixels, which can change. Compute positions from `width()`, `height()` and `center()`, and re-place elements in `onResize`:

```js
const score = add([text("Score: 0"), anchor("topright"), pos(width() - 16, 16), fixed()]);
onResize(() => (score.pos.x = width() - 16));
```

## Following the object

Every frame, each element follows these fields of its object when the object has them:

- `pos` (with `fixed()`), or the world position (without it);
- `hidden`, including the `hidden` of any ancestor: `enemy.hidden = true` hides the label too;
- `color`, for the text color (or the fill of a `uiRect`);
- `opacity`, so `fadeOut()` and `opacity(0.5)` work on HUD elements as they do on shapes.

## Styling with `obj.el`

`obj.el` is the DOM element (`null` when running headless). Style it like any element:

```js
const title = add([text("GAME OVER", { size: 48, font: "Impact, sans-serif" }), pos(480, 200), anchor("center"), fixed()]);
Object.assign(title.el.style, {
  letterSpacing: "0.1em",
  textShadow: "0 0 12px #f00",
  padding: "8px 16px",
  background: "rgba(0,0,0,.5)",
  borderRadius: "8px",
});
title.el.classList.add("my-title");
```

The HUD owns a few styles and rewrites them when they change: `transform` and `display` always, and `color` / `opacity` when the object has `color()` / `opacity()`. Set those through the components instead of through `el.style`. Everything else is yours.

Custom fonts work the usual way: declare an `@font-face` in your page and pass its name in `font`.

:::note
HUD elements ignore the mouse (`pointer-events: none`), so clicks go through to the game. If you want a clickable element, enable pointer events on that one element. The [on-screen controls](/threeplay.js/guides/input/#on-screen-controls) example does it.
:::

## Good to know

- HUD objects are normal game objects: they are tagged, found with `get()`, paused, destroyed (the element is removed with them), and cleared by `go()`. Create the HUD inside each scene.
- Elements are created hidden and shown on the first frame, so nothing flashes at the top-left corner.
- Writes to the DOM are skipped when nothing changed, so a HUD with many static labels is cheap.
- `worldToHud(worldPoint)` is the same as `toScreen(worldPoint)`: it projects a 3D point to logical screen coordinates, or returns `null` when it is behind the camera.
