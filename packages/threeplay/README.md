# threeplay

**kaplay's simplicity, three.js power.** A tiny, friendly 3D game engine for the browser.

[Website & docs](https://alex-roc.github.io/threeplay.js/) ·
[Examples](https://alex-roc.github.io/threeplay.js/examples/) ·
[Playground](https://alex-roc.github.io/threeplay.js/playground/) ·
[npm](https://www.npmjs.com/package/threeplay)

```js
import threeplay from "threeplay";

threeplay({ background: "#87ceeb" });

scene("game", () => {
  add([box(20, 1, 20), pos(0, -0.5, 0), color("#5a5"), area(), body({ isStatic: true })]);
  const player = add([capsule(0.4, 1.6), pos(0, 2, 0), color("#4af"), area(), character()]);
  camFollow(player);
  onUpdate(() => player.move(inputDir().multiplyScalar(5)));
  onKeyPress("space", () => player.isGrounded() && player.jump());
});

go("game");
```

## Why

There are great 3D engines for the web (Babylon.js, PlayCanvas) and great 3D
ecosystems (react-three-fiber, Threlte), but nothing that feels like
[kaplay](https://kaplayjs.com) in 3D: components and tags, `add([...])`,
`onCollide`, scenes, and a whole game in one `<script>`. threeplay is that, on top
of [three.js](https://threejs.org) (WebGPU with WebGL2 fallback) and
[Rapier](https://rapier.rs) physics — with the full power of both one property away
(`obj.object3d`, `k.renderer`, `k.physics.world`).

## Install

With a bundler:

```sh
npm install threeplay three
```

Without one, a single HTML file is enough (the standalone build bundles three.js;
Rapier is downloaded only if the game uses physics):

```html
<script type="importmap">
  { "imports": { "threeplay": "https://cdn.jsdelivr.net/npm/threeplay@0.1/dist/standalone/threeplay.mjs" } }
</script>
<script type="module">
  import threeplay from "threeplay";
  threeplay();
  add([box(1, 1, 1), pos(0, 0.5, 0), rotate(0, 30, 0), color("tomato")]);
  orbitCamera({ distance: 5, autoRotate: 20 });
</script>
```

Start with the [getting started guide](https://alex-roc.github.io/threeplay.js/getting-started/).

## What's inside

- Game objects made of components and tags, scenes, events, timers and tweens.
- Primitive shapes, glTF models with animations, lights, fog and shadows.
- Rapier physics: sensors, static/kinematic/dynamic bodies, a character controller, raycasts.
- Keyboard, mouse, pointer lock, touch and gamepad through virtual buttons.
- Cameras: follow, first person, third person, orbit, top-down, shake.
- A DOM HUD, ASCII levels, audio (with positional sound and synthesized beeps), health, state
  machines and a debug inspector.
- A small core where everything else is a plugin: write your own with the same API.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING](https://github.com/alex-roc/threeplay.js/blob/main/CONTRIBUTING.md)
and [`dev-docs/architecture.md`](https://github.com/alex-roc/threeplay.js/blob/main/dev-docs/architecture.md).

## License

MIT © Alex Ojeda Copa
