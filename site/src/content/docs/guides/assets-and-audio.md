---
title: Assets and audio
description: Load glTF models, textures and sounds, play animations, build models in code, and make positional audio and quick beeps.
sidebar:
  order: 10
---

Everything you load goes through `load()`, so **the first scene waits until every asset is ready** (the engine draws a progress bar meanwhile). Start loading at the top level of your file, then use the assets inside scenes by name.

## Loading models and textures

```js
// Needs the files: put your own .glb and .png under assets/.
loadRoot("assets/");                      // prefix for relative URLs
loadModel("knight", "knight.glb");
loadModel("tree", "kenney/tree.glb");
loadTexture("grass", "grass.png");

scene("main", () => {
  add([plane(60), material({ map: "grass", repeat: 12 })]);
  add([model("tree"), pos(5, 0, -4), scale(1.5)]);

  const knight = add([model("knight", { groundAlign: true, anim: "idle" }), pos(0, 0, 0), rotate()]);
  knight.onAnimEnd((name) => name === "attack" && knight.playAnim("idle"));
  onKeyPress("space", () => knight.playAnim("attack", { loop: false }));
});

go("main");
```

| Function | What it does |
| --- | --- |
| `loadRoot(path?)` | Sets the prefix for relative URLs (`"assets/"`), and returns the current one. URLs that start with a scheme (`http:`, `data:`, `blob:`) or with `/` are never prefixed. It also applies to `loadSound`. |
| `loadModel(name, url)` | Loads a glTF or GLB file under a name. Resolves with its data. |
| `loadTexture(name, url)` | Loads an image as a texture (sRGB, repeating) under a name. |
| `getModel(name)`, `getTexture(name)` | The loaded data, or `undefined`. |

Failed downloads are logged to the console and don't stop the game, but then `model(name)` throws when you use it, with an error that lists the names that did load.

### Where to get free assets

[Kenney](https://kenney.nl/assets) publishes thousands of game assets under the CC0 license (do whatever you want, no credit needed), with 3D packs in glTF/GLB: characters, props, buildings, vehicles, platformer kits. They are the quickest way to get a game that looks like a game. Check the license of anything else you download.

## Models

`model(name, options)` is a component that places an instance of a loaded model. It is a *shape* (it has the id `"shape"`, so it replaces `box()` and friends), so physics, the inspector and `obj.mesh` work with it.

```js
add([model("knight", { scale: 1.5, groundAlign: true, faceForward: true }), pos(0, 0, 0)]);
```

| Option | Default | Meaning |
| --- | --- | --- |
| `scale` | `1` | Uniform scale of the model. |
| `shadows` | `true` | Cast and receive shadows on every mesh. |
| `groundAlign` | `false` | Move the model so the bottom of its bounding box sits at y = 0 (the object's origin). Great for characters whose feet should touch the ground. |
| `faceForward` | `true` | glTF models face +Z but the engine's forward is −Z. With `true` the model is turned 180 degrees so it faces `forward()`. Use `false` for a model authored facing −Z. |
| `anim` | none | Name of an animation to start right away, looping. |
| `uniqueMaterials` | `false` | Give this instance its own copy of the materials. |

:::caution[Tinting models]
Instances of a model **share the same materials** (cheap), and `color()` and `opacity()` write to the materials. Used on a model without `uniqueMaterials: true`, they change **every** instance of that model, and the original. If you need to tint or fade one instance, pass `uniqueMaterials: true`:

```js
add([model("knight", { uniqueMaterials: true }), color("tomato"), opacity(0.5)]);
```
:::

### Models and physics

A model gets a collider from its **bounding box** by default, so `area(), character()` and `area(), body(...)` just work. For an exact collision shape on static scenery use `area({ shape: "mesh" })`, and for a tighter dynamic one `area({ shape: "hull" })`. See [Physics](/threeplay.js/guides/physics/).

```js
add([model("house"), pos(10, 0, 0), area({ shape: "mesh" }), body({ isStatic: true })]);
```

### Animations

Models that come with animations get these fields:

```js
knight.anims;                       // ["idle", "run", "attack"]
knight.playAnim("run");             // cross-fades from the current animation
knight.playAnim("attack", { loop: false, speed: 1.5, fade: 0.1 });
knight.curAnim();                   // "attack"
knight.stopAnim();                  // back to the bind pose
knight.onAnimEnd((name) => {});     // a non-looping animation finished
knight.mixer;                       // the THREE.AnimationMixer (null without animations)
```

`playAnim` options are `loop` (default `true`), `speed` (1) and `fade` (seconds of cross-fade, 0.2). A non-looping animation holds its last pose and then fires `animEnd`. Calling `playAnim` again for the animation that is **already playing** only updates its speed, so it is safe to call every frame:

```js
onUpdate(() => {
  const dir = inputDir();
  hero.move(dir.clone().multiplyScalar(5));
  hero.playAnim(dir.lengthSq() > 0 ? "run" : "idle");
});
```

An unknown name throws, listing the available animations. Animations tick with game time, so pausing the game or the object freezes them.

### Building models in code: `defineModel`

`defineModel(name, scene, animations?)` registers any `THREE.Object3D` as a model, which is what you want when you build something procedurally, parse a file with your own loader, or run offline. After that, `model(name)` instances it like a loaded one.

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#a2d2ff" });

// Build a tree out of three.js pieces, once.
const tree = new THREE.Group();
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2), new THREE.MeshStandardMaterial({ color: "#7f5539" }));
trunk.position.y = 0.6;
const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 12), new THREE.MeshStandardMaterial({ color: "#2d6a4f" }));
leaves.position.y = 2.2;
tree.add(trunk, leaves);
defineModel("tree", tree);

scene("forest", () => {
  add([plane(40), color("#95d5b2")]);
  // A hundred instances share the same geometry and materials.
  for (let i = 0; i < 100; i++) {
    add([model("tree", { scale: rand(0.7, 1.6) }), pos(rand(-18, 18), 0, rand(-18, 18)), rotate(rand(360))]);
  }
  orbitCamera({ distance: 20, autoRotate: 10 });
});

go("forest");
```

## Textures

Load an image with `loadTexture(name, url)` and use it by name in `material()`. See [Shapes and rendering](/threeplay.js/guides/shapes-and-rendering/#materials) for the material options.

```js
loadTexture("bricks", "bricks.png");

scene("main", () => {
  add([box(4, 3, 0.4), pos(0, 1.5, 0), material({ map: "bricks", repeat: [4, 3] })]);
});
```

`repeat` tiles the texture (a number, or `[x, y]`). Textures are loaded as sRGB with repeat wrapping, which is right for color images. For anything special (normal maps, other color spaces), create the `THREE.Texture` yourself and pass it: `material({ map: myTexture })`.

## Audio

Sounds use WebAudio. Load them at the top level with `loadSound(name, url)`, then `play(name)` inside the game. Any format the browser can decode works (ogg, mp3, wav).

```js
loadRoot("assets/");
loadSound("boom", "boom.ogg");
loadSound("theme", "theme.ogg");

scene("main", () => {
  const bomb = add([sphere(0.4), pos(5, 0.4, 0), color("#222")]);

  // Background music, stopped when the scene ends
  const music = play("theme", { loop: true, volume: 0.4 });
  onSceneLeave(() => music.stop());

  // A sound that comes from the bomb: louder when the camera is close, panned left or right
  onKeyPress("space", () => play("boom", { at: bomb, volume: 0.8 }));

  // A synthesized blip: no file needed
  onClick(() => beep({ freq: 880, slideTo: 440, duration: 0.15 }));
});

go("main");
```

### `play(name, options)`

| Option | Default | Meaning |
| --- | --- | --- |
| `volume` | `1` | Gain from 0 to 1. |
| `loop` | `false` | Repeat until stopped. |
| `speed` | `1` | Playback rate (also changes the pitch). |
| `detune` | `0` | Pitch shift in cents. |
| `at` | none | Makes the sound **positional**: a point, or an object it follows. |
| `panning` | `"HRTF"` | Spatialization of positional sounds; `"equalpower"` is cheaper. |
| `refDistance` | `1` | Distance at which a positional sound starts to fade. |
| `rolloff` | `1` | How fast a positional sound fades with distance. |

`play()` returns a handle with `paused`, `volume` and `speed` (assignable), `stop()`, and `ended`, a promise that resolves when the sound finishes or is stopped (a loop only resolves when stopped).

```js
const engine = play("engine", { loop: true, volume: 0.3 });
onUpdate(() => (engine.speed = 0.8 + player.vel.length() * 0.05));

play("boom").ended.then(() => debug.log("boom finished"));
```

An unknown sound name throws an error listing the sounds that are loaded.

### Positional sound

With `at`, the sound is placed in the 3D world. The **listener is the camera**: volume fades with the distance to it and the sound pans according to the camera's orientation. If `at` is an object, the sound follows it every frame (and stays where it was if the object is destroyed). If it is a vector, the vector is read every frame, so changing it moves the sound.

```js
play("footstep", { at: enemy });
play("explosion", { at: vec3(10, 0, -20), refDistance: 5, rolloff: 0.5 });
```

### `beep(options)`

A tiny synthesizer for sound effects without any file, perfect for prototypes, UI and coins:

```js
beep();                                        // 440 Hz, 0.1 s square wave
beep({ freq: 660, duration: 0.15, type: "sine", volume: 0.2 });
beep({ freq: 220, slideTo: 80, duration: 0.2, type: "sawtooth" });   // a falling zap
```

`freq` is in Hz (440 by default), `duration` in seconds (0.1), `type` is a WebAudio wave (`"square"` by default, also `"sine"`, `"sawtooth"`, `"triangle"`), `volume` 0 to 1 (0.3) and `slideTo` slides the pitch to another frequency by the end.

### Volume and the context

```js
volume(0.5);      // master volume, 0 to 1 (also works before the audio context exists)
volume();         // read it
audioCtx;         // the shared AudioContext (null where there is no WebAudio)
```

### Good to know

- **Autoplay policy.** Browsers keep audio silent until the player interacts with the page. threeplay resumes the audio on the first click, tap or key press, so a sound triggered before that is silent. Put a "click to start" scene before your music, or start the music from a user action.
- **Sounds keep playing across scenes.** `go()` does not stop them: call `stop()` on the handle, for example in `onSceneLeave`.
- Without WebAudio (Node, tests) every audio function is inert: `play()` returns a handle that has already ended, and `loadSound` resolves with `null`.
- Relative sound URLs use `loadRoot()` too.
