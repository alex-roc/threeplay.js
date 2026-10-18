# Contributing to threeplay

Thanks for helping! threeplay aims to be the simplest way to make a 3D game in
the browser: kaplay's friendliness on top of three.js. Keep that in mind: a new
feature should read well in a 10-line game.

## Setup

```sh
pnpm install
pnpm dev          # examples with hot reload at http://localhost:5173
pnpm test         # unit tests (vitest)
pnpm typecheck && pnpm lint
pnpm build        # npm + standalone builds
pnpm site:dev     # the website and docs
```

Read [`dev-docs/architecture.md`](dev-docs/architecture.md) first: it explains
the core, the plugin contract and the shared interfaces.

## Writing a component

A component is a function returning a plain object:

```js
export function spin(speed = 90) {
  return {
    id: "spin",
    require: ["rotate"],
    speed,
    update() {
      this.rot.y += this.speed * dt();
    },
    inspect() {
      return `${this.speed}°/s`;
    },
  };
}
```

Fields and methods are merged into the game object; `add`, `update`,
`fixedUpdate`, `destroy` and `inspect` are lifecycle hooks with `this` bound to
the object. Prefer closures for private state.

## Writing a plugin

```ts
import { definePlugin } from "threeplay";

export const spinPlugin = definePlugin({
  name: "spin",
  dependencies: ["transform"],
  install(k) {
    return { spin };
  },
});

// TypeScript users: make k.spin() typed
declare module "threeplay" {
  interface PluginRegistry { spin: { spin: typeof spin } }
}
```

Use `k.hooks` for systems (`afterFixedUpdate`, `render`, `sceneEnter`…) and
`k.load(promise)` for async setup. A plugin can live in its own npm package
(`threeplay-plugin-*`); built-in plugins are just the ones most games need.

## Pull requests

- One topic per PR, with tests for new behavior.
- Public API gets TSDoc (the docs site is generated from it) and, if user
  facing, a guide or example update in `site/`.
- Add a changeset: `pnpm changeset`.
- Code, comments and docs in English.
