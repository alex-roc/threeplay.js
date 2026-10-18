---
title: Physics and collisions
description: Colliders, rigid bodies and character controllers on Rapier, collision events, raycasts, gravity and the limits to know about.
sidebar:
  order: 5
---

Physics runs on [Rapier](https://rapier.rs). It is downloaded as a separate chunk when the game starts, in parallel with your assets (the first scene waits for it), and you use it through three components:

| I want... | Use |
| --- | --- |
| A pickup, a trigger zone, a sensor | `area()` alone |
| A floor or a wall that never moves | `area(), body({ isStatic: true })` |
| A crate or a ball that the physics pushes around | `area(), body()` |
| A platform I move from code that pushes other bodies | `area(), body({ kinematic: true })` |
| A player or an NPC I control from code | `area(), character()` |

Here they are together: a character that walks, jumps and pushes crates, over a floor, a wall, a falling stack and a moving platform.

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#a8dadc" });

scene("main", () => {
  // Static: a floor and a wall
  add([box(40, 1, 40), pos(0, -0.5, 0), color("#457b9d"), area(), body({ isStatic: true }), "floor"]);
  add([box(8, 3, 1), pos(0, 1.5, -8), color("#1d3557"), area(), body({ isStatic: true })]);

  // Dynamic: a stack of crates that tumbles when hit
  for (let y = 0; y < 4; y++) {
    for (let x = -1; x <= 1; x++) {
      add([box(1), pos(x * 1.05, 0.5 + y * 1.02, -3), color("#e9c46a"), area({ friction: 0.8 }), body({ mass: 1 }), "crate"]);
    }
  }

  // Kinematic: a platform moved from code
  const platform = add([box(4, 0.4, 4), pos(9, 1, 0), color("#2a9d8f"), area(), body({ kinematic: true })]);
  onUpdate(() => (platform.pos.x = 9 + Math.sin(time()) * 3));

  // Sensors: coins you walk through
  for (let i = 0; i < 5; i++) {
    add([sphere(0.3), pos(-6 + i * 3, 0.8, 5), color("gold"), area(), "coin"]);
  }

  // A character controlled from code
  const player = add([
    capsule(0.4, 1.6),
    pos(0, 1, 6),
    rotate(),
    color("#f77f00"),
    area(),
    character({ stepHeight: 0.3 }),
    "player",
  ]);
  camFollow(player, { offset: vec3(0, 6, 10) });

  onUpdate(() => {
    const dir = inputDir();
    player.move(dir.clone().multiplyScalar(6));
    if (dir.lengthSq() > 0) player.lookAt(player.worldPos().add(dir));
  });
  onButtonPress("jump", () => player.isGrounded() && player.jump(9));

  // Collisions
  player.onCollide("coin", (coin) => {
    coin.destroy();
    beep({ freq: 880, duration: 0.1 });
  });

  // Raycast: push the crate in front of you
  onKeyPress("e", () => {
    const hit = raycast(player.worldPos(), player.forward(), 2.5, { tag: "crate" });
    if (hit) hit.obj.applyImpulse(player.forward().multiplyScalar(12));
  });

  add([text("WASD move, space jump, E push", { size: 16 }), pos(20, 510), fixed()]);
});

go("main");
```

## `area()`: a collider

`area()` gives an object a collider. By default the collider is **derived from the object's shape**:

| Shape | Collider |
| --- | --- |
| `box` | cuboid |
| `sphere` | ball |
| `capsule`, `cylinder`, `cone` | the same shape |
| `plane` | a thin cuboid whose top face is at the object's origin |
| `mesh`, `model` | the bounding box |

An `area()` **without a `body()` is a sensor**: it detects overlaps and fires events, but nothing bounces off it, and the object moves freely with its `pos`. That is what you want for coins, checkpoints and trigger zones. With `body()` or `character()` the collider is solid.

```js
area({
  shape: "auto",         // "auto" | "box" | "sphere" | "capsule" | "mesh" | "hull"
  size: vec3(2, 1, 2),   // override the size (local units, multiplied by the object's scale)
  offset: vec3(0, 0.5, 0),
  sensor: true,          // force sensor on or off (default: true only without a body)
  friction: 0.5,
  restitution: 0.3,      // bounciness
});
```

- `size` makes a box of that size, whatever the shape. A big invisible `area({ size })` is the quick way to make a trigger zone, or a generous hitbox.
- `shape: "mesh"` builds an exact triangle mesh from the geometry. It is for **static** objects only: a dynamic body falls back to a convex hull with a console warning. `shape: "hull"` is a convex hull.
- `obj.area.sensor` tells you what the object ended up with.

:::caution
`area()` alone does not make a floor: the player falls through it. Solid things need `body({ isStatic: true })` (or `kinematic`).
:::

## `body()`: rigid bodies

`body()` makes the object part of the simulation. It needs `area()`.

```js
body();                        // dynamic: gravity, collisions, forces
body({ isStatic: true });      // never moves: floors, walls
body({ kinematic: true });     // moved by your code, pushes dynamic bodies
```

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `mass` | from the collider volume | Mass in kg. |
| `gravityScale` | `1` | Multiplies gravity for this body. |
| `damping` | `0` | Linear damping (air drag). |
| `angularDamping` | `0.05` | Angular damping. |
| `lockRotation` | `false` | Never rotate: handy for upright "player" boxes. |
| `ccd` | `false` | Continuous collision detection, for fast objects that might tunnel through walls. |

What a dynamic body gives you:

```js
ball.vel;                          // linear velocity (m/s): a live vector, read or assign
ball.vel.y = 10;
ball.angularVel;                   // degrees per second
ball.applyImpulse(vec3(0, 5, 0));  // a sudden push (one shot)
ball.applyForce(vec3(0, 20, 0));   // a force for the next frame: call it every frame to keep it
ball.applyTorqueImpulse(vec3(0, 3, 0));
ball.jump(8);                      // sets the vertical speed (default 8)
ball.isGrounded();                 // something solid just below?
ball.isFalling();
ball.onGround(() => debug.log("landed"));
ball.teleport(vec3(0, 3, 0));      // moves it and resets its velocity
```

Notes:

- Moving a dynamic body by changing `pos` also works: the engine notices it and teleports the body.
- **`move()` on a dynamic body sets its horizontal velocity** (and keeps the vertical one). If you stop calling it, the body keeps sliding until friction stops it. Use `damping`, or call `move(0)`.
- **A static body does not follow code**: changing the `pos` of a `body({ isStatic: true })` has no effect on collisions. Use `kinematic` for moving platforms.
- `isGrounded()` on a body is a short ray down from the bottom of the collider. It is approximate for tumbling objects, so combine `lockRotation: true` with it for player-like boxes.

## `character()`: a character controller

`character()` is a **kinematic character controller**: you say where you want to go and it handles the rest. It slides along walls, climbs small steps and slopes, sticks to the ground on stairs, and falls with gravity. It is almost always a better choice than a dynamic body for a player.

```js
const player = add([capsule(0.4, 1.8), pos(0, 2, 0), area(), character(), "player"]);

onUpdate(() => player.move(inputDir().multiplyScalar(6)));  // a velocity, in m/s
onButtonPress("jump", () => player.isGrounded() && player.jump());
```

| Option | Default | Meaning |
| --- | --- | --- |
| `stepHeight` | `0.3` | Highest step it climbs automatically. |
| `maxSlope` | `45` | Steepest walkable slope, in degrees. |
| `snapToGround` | `0.3` | How far it snaps down to the ground on slopes and stairs. |
| `gravityScale` | `1` | Multiplies the world gravity. |
| `jumpForce` | `8` | Default speed of `jump()`. |

It has `vel` (the vertical part includes gravity), `jump(force?)`, `isGrounded()`, `isFalling()`, `onGround(fn)` and `teleport(pos)`.

- Use `move()` for **horizontal** movement and let gravity do the vertical part. `move()` accumulates over a frame, so you can call it more than once.
- Characters move once per rendered frame, after your `update` code, so a camera that follows them never jitters.
- Characters walk through sensors (coins, zones), but the sensors still detect them.
- `character()` and `body()` can't be on the same object (a character already is a kinematic body); threeplay throws if you try.
- A character assumes gravity points down and that it is a top-level object, or at least that its movement is in world space.
- Nothing carries a character with a moving platform: it does not inherit the platform's motion.

## Collision events

Collisions arrive as events on the objects involved. They need an `area()` on both.

```js
player.onCollide("coin", (coin, col) => coin.destroy());   // started touching an object with that tag
player.onCollide((other, col) => debug.log("touched", other.id));   // any object
player.onCollideUpdate("lava", () => player.hurt(1));       // every fixed step while touching
player.onCollideEnd("platform", () => debug.log("left it"));    // stopped touching

player.isColliding("coin");       // touching any object with that tag?
player.isColliding(somebody);     // or that very object
player.getCollisions();           // every object touching it right now
```

The `col` argument is `{ other, sensor, normal }`. `sensor` says that one of the colliders is a sensor (there is no physical response), and `normal` points from the other object towards this one (`null` for sensors). `onCollideEnd` handlers only get the other object.

You can also listen globally by pair of tags. The handler receives both objects:

```js
onCollide("player", "coin", (player, coin, col) => coin.destroy());
onCollide("bullet", "enemy", (bullet, enemy) => enemy.hurt(1));
onCollideUpdate("player", "lava", (player) => player.hurt(1));
onCollideEnd("player", "ladder", (player) => (player.climbing = false));
```

These are scene listeners like any other: `go()` removes them if you registered them in a scene. With the same tag on both sides (`onCollide("crate", "crate", ...)`) the handler runs once for each side of a contact.

Collisions are detected during the fixed physics step, so the handlers run at the 50 Hz step rate. When an object is destroyed while touching others, the survivors get `collideEnd`.

## Raycasts

`raycast(origin, direction, maxDistance = 1000, options?)` returns the first hit or `null`:

```js
const hit = raycast(player.worldPos(), player.forward(), 10, { exclude: [player], tag: "enemy" });
if (hit) {
  hit.obj;        // the object that was hit
  hit.point;      // where, in the world
  hit.normal;     // the surface normal there
  hit.distance;   // meters from the origin
}
```

The direction is normalized for you. Options: `exclude` (objects to ignore), `tag` (only hit objects with this tag) and `sensors` (include sensors, `false` by default). Colliders are visible to queries after the first physics step that follows their creation.

Typical uses: ground and wall checks, line of sight (`raycast(enemy.worldPos(), toPlayer, dist, { exclude: [enemy] })?.obj === player`) and shooting (`raycast(camPos(), camera3d.getWorldDirection(vec3()), 50)` fires along the camera's exact view direction; `camForward()` is flattened onto the ground plane).

## Gravity

```js
setGravity(30);              // a number pulls down (−Y) with that strength
setGravity(vec3(0, -9.81, 0));   // or give a vector
getGravity();
threeplay({ physics: { gravity: 12 } });   // or at startup
```

The default is **20 m/s²**, not the real 9.81. Real gravity feels floaty at game scale: a jump with speed 8 reaches 1.6 m under 20 m/s² but 3.3 m under 9.81, and it takes twice as long. Most games (platformers, shooters, third-person adventures) want something between 20 and 30, so threeplay starts there. Use `setGravity(9.81)` when the point is realism: a physics sandbox, objects that should fall like in real life.

Gravity affects bodies and characters, and it is **not** reset by `go()`: set it at the start of each scene. `gravityScale` on `body()` or `character()` adjusts it per object.

## Turning physics off

```js
threeplay({ physics: false });
```

Rapier is not even downloaded. `area()`, `body()` and `character()` still exist but do nothing (a single warning goes to the console), so use this for games without collisions: viewers, menus, simple movement code of your own.

## Debugging colliders

Press **F1** (or start with `threeplay({ debug: true })`, or set `debug.inspect = true`) and the inspector draws every collider and contact as a wireframe over the game. An object's inspector line shows its kind, whether it is a sensor and how many contacts it has: for example `area (sensor), touching 1` for a coin or `character, touching 2` for a player. See [Debugging](/threeplay.js/guides/debugging/).

## The Rapier escape hatch

`physics` (that is, `k.physics`) is the backend. `physics.world` is the `RAPIER.World` and `physics.native` is the `RAPIER` module itself (both are `null` until physics has loaded, so use them after the first scene starts).

```js
onKeyPress("g", () => {
  physics.world.forEachRigidBody((rb) => rb.wakeUp());
});
```

## Limitations to know about

- **Scale is baked in** when the collider is created. Scaling an object afterwards does not resize its collider.
- Changing the components of a live object (adding a `body()` later, for instance) rebuilds its body.
- `hidden` does not disable colliders. Destroy the object or lose the `area()` instead.
- There are no collision layers or masks: decide what matters with tags in your handlers.
- There are no joints or other Rapier constraints in the API. `physics.world` gives you Rapier directly, but the engine does not expose the Rapier body behind an object, so treat it as an advanced escape hatch.
- One physics world per game, stepped at the fixed rate (`fixedHz`, 50 by default).
