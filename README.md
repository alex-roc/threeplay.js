# threeplay

**kaplay's simplicity, three.js power.** A tiny, friendly 3D game engine for the browser.

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

> 🚧 Work in progress — the first release (0.1) is being built. See
> [`dev-docs/architecture.md`](dev-docs/architecture.md) and [CONTRIBUTING](CONTRIBUTING.md).

## Why

There are great 3D engines for the web (Babylon.js, PlayCanvas) and great 3D
ecosystems (react-three-fiber, Threlte), but nothing that feels like
[kaplay](https://kaplayjs.com) in 3D: components and tags, `add([...])`,
`onCollide`, scenes, and a whole game in one `<script>`. threeplay is that, on top
of [three.js](https://threejs.org) (WebGPU with WebGL2 fallback) and
[Rapier](https://rapier.rs) physics — with the full power of both one property away
(`obj.object3d`, `k.renderer`, `k.physics.world`).

## License

MIT
