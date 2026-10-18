---
title: Shapes and rendering
description: Primitive shapes, colors and materials, lights, fog and shadows, renderer and canvas options, screen projection and the three.js escape hatches.
sidebar:
  order: 4
---

threeplay draws with three.js: WebGPU where the browser has it, WebGL2 otherwise. You describe what things look like with a few components and the engine takes care of the rest.

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#0b132b" });
setFog({ color: "#0b132b", near: 10, far: 40 });
sun.intensity = 1.2; // the default sun; see "Lighting"

// A floor that is a little shiny
add([plane(60), color("#3a506b"), material({ roughness: 0.35, metalness: 0.3 })]);

// Different looks for the same shape
add([sphere(1), pos(-4, 1, 0), color("tomato")]);
add([sphere(1), pos(-1.3, 1, 0), color("gold"), material({ type: "toon" })]);
add([sphere(1), pos(1.3, 1, 0), color("skyblue"), material({ wireframe: true })]);
add([box(1.6), pos(4, 0.8, 0), color("#9d4edd"), material({ emissive: "#9d4edd", emissiveIntensity: 0.6 })]);

// A glowing orb that carries a point light around
const orb = add([
  sphere(0.2),
  pos(0, 2, 3),
  color("orange"),
  material({ type: "basic" }), // unlit: it always looks fully bright
  pointLight({ color: "orange", intensity: 60 }),
]);
onUpdate(() => (orb.pos.x = wave(-5, 5, time() * 1.5)));

camPos(0, 5, 12);
camLookAt(vec3(0, 1, 0));
```

## Primitive shapes

All shapes are centered on the object's origin, in meters.

| Component | Defaults | Notes |
| --- | --- | --- |
| `box(width, height, depth)` | `1`, same as width, same as width | `box(2)` is a cube. |
| `sphere(radius)` | `0.5` | |
| `capsule(radius, height)` | `0.5`, `2` | `height` is the **total** height, including the round caps. |
| `cylinder(radius, height)` | `0.5`, `1` | |
| `cone(radius, height)` | `0.5`, `1` | The tip points up. |
| `plane(width, depth)` | `10`, same as width | A flat rectangle on the XZ plane, facing up. Handy for floors. |
| `mesh(geometry, material?)` | | Any `THREE.BufferGeometry` and, optionally, a `THREE.Material`. |

Every primitive takes an optional last argument with these options:

```js
sphere(1, { segments: 48, castShadow: false, receiveShadow: true });
```

- `castShadow` / `receiveShadow`: both `true` by default.
- `segments`: detail of round shapes (24 by default).

A shape is a `THREE.Mesh` that is a **child of the object's node**, so `scale` and rotation apply to it. You can reach it with `obj.mesh`, and `obj.shape` holds a plain description (`{ kind: "box", width, height, depth }`) that physics reads to build colliders. The geometry and the default material are disposed when the object is destroyed (but not the ones you pass to `mesh()`).

A shape component has the id `"shape"`, so an object has **one** shape. Loaded models (`model()`) use the same id.

```js
// `THREE` is the three.js namespace the engine uses (`k.THREE` without global mode).
add([mesh(new THREE.TorusKnotGeometry(1, 0.3, 128, 16), new THREE.MeshNormalMaterial()), pos(0, 2, 0)]);
```

## Color and opacity

`color()` accepts any CSS name, hex string or number, or 0–255 channels:

```js
color("tomato");
color("#ff7800");
color(0xff7800);
color(255, 120, 0);
color([255, 120, 0]);
```

`obj.color` is a `THREE.Color` **shared with the material**, so both of these change the object's color on screen:

```js
ball.color.set("white");
ball.color = "crimson";   // the setter copies the value
```

`opacity(0.5)` makes the object translucent. `obj.opacity` goes from 0 to 1 and can be animated; the object only becomes `transparent` for the renderer while the value is below 1.

```js
const ghost = add([sphere(1), pos(0, 1, 0), color("white"), opacity(0.4)]);
ghost.opacity = 0.8;
ghost.fadeOut(1, true);   // fade to 0 in one second, then destroy the object
```

## Materials

Shapes get a standard (PBR) material, light gray, roughness 0.8. Add `material()` to change it:

```js
material({ type: "standard", roughness: 0.2, metalness: 0.8 });
material({ type: "toon" });                     // cel shading
material({ type: "basic" });                    // unlit
material({ wireframe: true });
material({ flatShading: true });                // faceted look
material({ emissive: "red", emissiveIntensity: 2 });
material({ map: "grass", repeat: 10 });         // a loaded texture, tiled 10x10
material(new THREE.MeshPhysicalMaterial({ clearcoat: 1 }));   // your own material
```

| Option | Meaning |
| --- | --- |
| `type` | `"standard"` (default), `"basic"`, `"toon"`, `"lambert"`, `"phong"`. |
| `roughness`, `metalness` | For `"standard"` only (defaults 0.8 and 0). |
| `emissive`, `emissiveIntensity` | Self-illumination. |
| `wireframe`, `flatShading` | Rendering style. |
| `map` | The name of a texture loaded with `loadTexture()`, or a `THREE.Texture`. |
| `repeat` | How many times the texture repeats, a number or `[x, y]`. |

`color()` still works with `material()`: the color multiplies the texture. Load textures like this (details in [Assets and audio](/threeplay.js/guides/assets-and-audio/)):

```js
loadTexture("grass", "grass.png");
scene("main", () => add([plane(50), material({ map: "grass", repeat: 10 })]));
```

A texture given by name may finish loading after the object was created; it is applied as soon as it is available. `repeat` clones the texture, so the one you loaded is never modified.

:::tip
For flat-shaded, "game jam" visuals, `color()` on the default material is all you need. Reach for `material()` when you need textures, unlit or toon looks, or shine.
:::

## Renderer and canvas options

All of these go in `threeplay({ ... })`.

| Option | Default | Meaning |
| --- | --- | --- |
| `width`, `height` | fill the page | Fixed **logical size**. HUD coordinates and the camera aspect use it, and the canvas is scaled to fit. Give both or neither. |
| `letterbox` | `true` with a fixed size | Keep the aspect ratio with bars. With `false` the game stretches to fill the container. |
| `background` | `"#9fd3ff"` (sky blue) | Clear color; `null` keeps the canvas transparent. |
| `renderer` | `"auto"` | `"auto"` (WebGPU, falling back to WebGL2), `"webgpu"`, `"webgl"`, or `"none"` (headless, see [Debugging](/threeplay.js/guides/debugging/)). |
| `pixelRatio` | `min(devicePixelRatio, 2)` | Cap of the device pixel ratio. Lower it for speed on high-density screens. |
| `antialias` | `true` | Antialiasing. |
| `shadows` | `true` | Shadow maps. `false` turns them off everywhere. |
| `lighting` | `"default"` | `"default"` adds the sun and ambient light; `"none"` adds nothing. |
| `canvas` | created for you | Draw into your own `<canvas>`. |
| `root` | `document.body` | Element that receives the canvas and HUD. Anything but the body makes the game fit inside that element. |

Embedding the game in a part of a page:

```js
threeplay({ root: document.querySelector("#game"), width: 800, height: 450 });
```

The container needs a size (CSS width and height). With the default root, the game fills the whole window and `body` gets `margin: 0; overflow: hidden`.

`width()`, `height()` and `center()` return the logical size and its center; `onResize(fn)` runs when the size or scale changes.

### Background and fog

```js
setBackground("#10002b");
setBackground(null);                          // transparent canvas
setFog({ color: "#10002b", near: 5, far: 30 });   // linear fog
setFog({ density: 0.04 });                    // exponential fog (color defaults to the background)
setFog(null);                                 // no fog
```

Background and fog are **not** reset by `go()`: set them at the start of each scene if scenes differ.

## Lighting

By default threeplay lights the scene with a warm **sun** (a `DirectionalLight` that casts shadows) and a hemisphere **ambient** light. Both are exposed so you can tune them:

```js
sun.intensity = 1.5;
sun.color.set("#ffd6a5");
ambient.intensity = 0.6;
```

The area around the camera is the one that gets shadows (a box about 40 m wide that follows the camera), so shadows stay sharp as you move around. That follow logic rewrites the sun's `position` and `target` every frame, so re-aim it with `setSunDirection` instead of moving it. The argument is the direction the light travels:

```js
setSunDirection({ x: -1, y: -2, z: -1 }); // from above, low on the +X/+Z side
```

For your own lights set `lighting: "none"` (then `sun` and `ambient` are `null`) or just add more. Lights are components, so they hang from an object and move with it:

| Component | Defaults |
| --- | --- |
| `pointLight({ color, intensity, distance, decay, castShadow })` | intensity 20, `distance` 0 (no limit), decay 2 |
| `spotLight({ color, intensity, angle, distance, penumbra, castShadow })` | intensity 100, angle 45 degrees, penumbra 0.3 |
| `dirLight({ color, intensity, castShadow })` | intensity 2 |

`castShadow` is `false` by default for lights (shadows are expensive). Spot and directional lights shine along the object's **forward** direction (−Z), so rotate the object to aim them:

```js
const lamp = add([pos(0, 6, 0), rotate(-90, 0, 0), spotLight({ color: "white", angle: 30, castShadow: true })]);
lamp.light.intensity = 150;   // `obj.light` is the THREE.Light
```

Light intensities use three.js' physically based units: a point light of intensity 20 is a modest lamp; increase it for bigger scenes.

## Screen projection

`toScreen(worldPoint)` converts a 3D point to logical screen coordinates (`null` if it is behind the camera). `screenRay(screenPoint)` returns the ray through a screen point, which is useful for aiming.

```js
const p = toScreen(enemy.worldPos());
if (p) debug.log(`enemy is at ${p.x | 0}, ${p.y | 0} on screen`);

const ray = screenRay(center());   // through the middle of the screen
```

To attach a label to a 3D object you don't need to project by hand: a `text()` without `fixed()` floats over its position. See [HUD](/threeplay.js/guides/hud/).

## Screenshots

`screenshot()` returns a PNG data URL of the current frame (an empty string when headless):

```js
onKeyPress("f2", () => {
  const a = document.createElement("a");
  a.href = screenshot();
  a.download = "screenshot.png";
  a.click();
});
```

## Escape hatches

threeplay never hides three.js. Everything is one property away:

| What | How |
| --- | --- |
| The three.js namespace the engine uses | `THREE` (global mode) or `k.THREE` |
| The three.js scene | `k.scene3d` |
| The camera (a `THREE.PerspectiveCamera`) | `k.camera3d` |
| The raw renderer (`WebGPURenderer` or `WebGLRenderer`) | `k.renderer.three` (`null` until the renderer finished loading) |
| Which backend is running | `k.renderer.kind` (`"webgpu"`, `"webgl"` or `"none"`) |
| The node of a game object | `obj.object3d` |
| The mesh of a shape | `obj.mesh` |
| The canvas | `k.canvas` |

```js
// Add post-processing, tweak the renderer, or draw any three.js thing you like.
scene3d.add(new THREE.GridHelper(40, 40));
onLoad(() => {
  if (renderer.three) renderer.three.toneMappingExposure = 1.2;
});
```

:::caution
You can replace the camera: `camera3d = myCamera` (in global mode the global is a live accessor to `k.camera3d`). The renderer keeps the aspect ratio in sync for a replaced camera too.
:::

:::note
When you give a model or a `mesh()` your own `THREE.Material` and then also use `color()` or `opacity()` on it, those components write to the material. Models share materials between instances; see [Assets and audio](/threeplay.js/guides/assets-and-audio/#models) for `uniqueMaterials`.
:::
