---
title: Game objects and components
description: How objects are built from components and tags, how to find and destroy them, nest them, and write your own components.
sidebar:
  order: 1
---

Everything in a threeplay game is a **game object**: a list of components glued together, plus tags, plus a three.js node. You never subclass anything. `add()` takes the list and returns the object.

```js
const enemy = add([
  sphere(0.5),          // components: each one adds fields and behavior
  pos(0, 1, -8),
  color("crimson"),
  area(),
  health(3),
  "enemy",              // tags: plain strings
  { speed: 2 },         // a plain object is a component too
]);

enemy.move(0, 0, enemy.speed);
enemy.hurt(1);
console.log(enemy.hp, enemy.is("enemy")); // 2 true
```

## Components

A component is a plain object (usually returned by a function). When you `add` it, its **own properties are merged into the game object**: fields, methods, even getters and setters. That is why `enemy.hp`, `enemy.hurt()` and `enemy.move()` exist: they came from `health()` and `pos()`.

A few keys are special. They are not merged, and the engine calls them with `this` bound to the object:

| Key | When it runs |
| --- | --- |
| `id` | Names the component. Two components with the same `id` replace each other. Also what `has(id)` and `unuse(id)` look for. |
| `require` | Ids of components the object must also have. Checked after the whole `add([...])`, so the order in the list does not matter. |
| `conflicts` | Ids of components that can't be on the same object (checked both ways), e.g. `body()` and `character()`. |
| `add()` | The object entered the scene (or the component was added to a live object). |
| `update()` | Every frame, while the object exists and is not paused. |
| `fixedUpdate()` | At the fixed rate (50 Hz), before the physics step. |
| `destroy()` | The object was destroyed or the component was removed. |
| `inspect()` | Returns a short string for the [debug inspector](/threeplay.js/guides/debugging/). |

Hooks of the components of one object run in the order of the list, then the object's own `update` event handlers, then its children. List `pos()` before a component that reads the position in `add()`.

## Tags

Tags are strings in the component list. They are how you find objects and how events and collisions know who is who.

```js
const boss = add([sphere(1), pos(0, 1, 0), "enemy", "boss"]);

boss.is("enemy");            // true
boss.is(["enemy", "boss"]);  // true: needs all of them
boss.tag("angry");           // add tags later
boss.untag("angry");
boss.tags;                   // ReadonlySet<string>
```

`"*"` is reserved: it matches every object (`get("*")` returns them all) and cannot be used as a tag.

## Adding, destroying and finding

```js
const coin = add([sphere(0.3), pos(2, 1, 0), "coin"]);

coin.exists();     // true
coin.destroy();    // the same as destroy(coin)
coin.exists();     // false

destroyAll("coin");           // destroy every object with a tag
```

`get(tag)` searches the **whole tree** by default (children, grandchildren...) and returns an array. Pass an array of tags and an option object to refine it:

```js
get("enemy");                                  // every object tagged "enemy"
get(["enemy", "boss"]);                        // tagged "enemy" AND "boss"
get(["coin", "gem"], { op: "or" });            // tagged "coin" OR "gem"
get("enemy", { recursive: false });            // only the root's direct children
player.get("enemy");                           // only descendants of player
```

Destroying an object destroys its children first, runs the `destroy` hooks of its components, emits its `destroy` event, and removes its three.js node. A destroyed object is `exists() === false` and has no parent. Keep that in mind when a callback holds on to an object that may be gone:

```js
wait(2, () => boss.exists() && boss.color.set("white"));
```

## Children and the three.js scene graph

An object can have children. They are created with the object's own `add()`:

```js
const car = add([box(1.6, 0.7, 3), pos(0, 0.6, 0), rotate(), color("#ffbe0b")]);
const cabin = car.add([box(1.2, 0.5, 1.3), pos(0, 0.55, 0.3), color("#023047")]);

cabin.parent === car;   // true
car.children;           // [cabin]
```

A child's `pos` is **local to its parent**, so the cabin moves and turns with the car. Use `worldPos()` (see [Transform](/threeplay.js/guides/transform/)) when you need the position in the world. Destroying the car destroys the cabin. `car.remove(cabin)` destroys one child.

Every game object owns a `THREE.Object3D` at `obj.object3d`, and a child's node is nested inside its parent's node. In other words, **the three.js scene graph is the object tree**. That makes the escape hatch trivial: you can hang any three.js object on a game object and it follows it.

```js
const lamp = add([pos(0, 3, 0)]);
const helper = new THREE.AxesHelper(2);   // `THREE` is the three.js namespace the engine uses
lamp.object3d.add(helper);
```

`k.root.object3d` (the root of the whole tree) lives in `k.scene3d`. You can also hide or freeze an object and its whole subtree:

```js
boss.hidden = true;   // not drawn (and ignored by clicks), but still updating
boss.paused = true;   // skips update and fixedUpdate, still drawn
```

## Changing components at runtime

```js
const guard = add([box(1, 2, 1), pos(0, 1, 0), color("steelblue")]);

guard.use(health(3));          // add a component (or a tag) to a live object
guard.has("health");           // true
guard.has(["health", "pos"]);  // true: needs all of them
guard.c("health");             // the component object itself
guard.unuse("health");         // remove it: its fields disappear again
```

`use()` runs the component's `add()` hook right away because the object is already in the scene. `unuse()` runs its `destroy()` hook and throws if another component of the object `require`s it.

## Writing your own components

Write a function that returns an object. Keep private state in the closure and public state in fields:

```js
import threeplay from "threeplay";

threeplay({ background: "#22223b" });

/** Floats up and down. */
function bob(height = 0.3, speed = 2) {
  let base = null; // private state lives in the closure
  return {
    id: "bob",
    require: ["pos"],
    speed, // public field: obj.speed can be changed at any time
    update() {
      base ??= this.pos.y;
      this.pos.y = base + Math.sin(time() * this.speed) * height;
    },
    inspect() {
      return `${height} m at ${this.speed}x`;
    },
  };
}

/** Turns around Y. */
function spin(degPerSecond = 90) {
  return {
    id: "spin",
    require: ["rotate"],
    update() {
      this.rot.y += degPerSecond * dt();
    },
  };
}

add([plane(20), color("#4a4e69")]);
for (let i = 0; i < 5; i++) {
  add([box(1), pos(-6 + i * 3, 1.5, 0), rotate(), color("#f2e9e4"), bob(0.4, 1 + i * 0.3), spin()]);
}
camPos(0, 4, 10);
camLookAt(vec3(0, 1.5, 0));
```

A few things to know:

- **`this` is the game object** inside `add`, `update`, `fixedUpdate`, `destroy` and `inspect`, and inside methods and accessors you define (when you call them as `obj.method()`).
- Use `function` or method syntax for hooks, **not arrow functions**, or `this` will not be the object. Arrow functions are fine for everything else (callbacks, closures).
- A plain object without an `id` is an *anonymous* component. It can have hooks too, which is handy for one-off behavior: `add([sphere(0.2), pos(), { update() { this.move(0, 1, 0); } }])`.
- `require` documents and enforces dependencies: forgetting `rotate()` fails right away with `Component "spin" requires component "rotate". Add rotate() too.`
- If you register a handler in a hook (`onUpdate` in `add()`), prefer the object's own `this.onUpdate(fn)`, `this.on(...)`: they die with the object.

### Property conflicts

Two components (or a component and the object itself) can't define the same property. threeplay throws and names both owners:

```js
add([{ id: "a", speed: 1 }, { id: "b", speed: 2 }]);
// Error: Component "b" can't add property "speed": it is already defined by component "a".

add([{ id: "c", destroy: 1 }]);   // `destroy` is a lifecycle key: never merged
add([{ id: "d", exists: 1 }]);
// Error: Component "d" can't add property "exists": it is already defined by the game object itself.
```

Pick unique field names (`speed`, `maxSpeed`...) or put related fields in one component and a sub-object: `follow: { target, offset }`.

Names the game object always has: `id`, `object3d`, `parent`, `children`, `tags`, `paused`, `hidden`, `add`, `remove`, `destroy`, `exists`, `get`, `is`, `tag`, `untag`, `use`, `unuse`, `has`, `c`, `on`, `trigger`, `onUpdate`, `onFixedUpdate`, `onDestroy`, `inspect`.

:::caution
A component with the same `id` as one already on the object **replaces** it (the old one gets `destroy()`). This is how `box(...)` and `sphere(...)`, which both have the id `"shape"`, exclude each other. Replacing a component that another one `require`s throws.
:::

## Typing

Components are typed. The type of `add([...])` is the merge of the fields of every component in the list, so `enemy.hp`, `enemy.speed` and `enemy.hurt()` autocomplete in the example at the top of this page. Tags are dropped from the type. For custom components, write a return type if you want your fields typed for the users of the component:

```ts
import type { Comp } from "threeplay";

// `this` inside the hooks is a GameObj with loosely typed fields.
function spin(speed = 90): Comp & { speed: number } {
  return {
    id: "spin",
    require: ["rotate"],
    speed,
    update() {
      this.rot.y += this.speed * k.dt();
    },
  };
}
```

## Inspecting objects

`obj.inspect()` returns the `inspect()` line of each of its components, keyed by id:

```js
player.inspect();
// { pos: "(0.00, 0.80, 0.00)", shape: "capsule", color: "#f77f00",
//   area: "character, touching 0", character: "grounded, vy=0.0" }
```

Press F1 in a running game to see the same information for the object under the mouse. See [Debugging](/threeplay.js/guides/debugging/).
