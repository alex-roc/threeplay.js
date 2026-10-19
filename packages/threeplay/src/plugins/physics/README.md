# physics

Collisions, rigid bodies and a kinematic character controller on top of
[Rapier](https://rapier.rs) (loaded lazily with a dynamic `import()`, so it lives in its own chunk).
Depends on `transform`; install it after `shapes` (colliders are derived from `obj.shape`) and
before `camera` (characters move in `afterUpdate`, and the camera must see the final position).

## API

| Function | What it does |
| --- | --- |
| `area(opts?)` | Gives the object a collider. Alone it is a **sensor**: detects overlaps, nothing bounces. Adds `onCollide`, `onCollideUpdate`, `onCollideEnd`, `isColliding`, `getCollisions`. |
| `body(opts?)` | Rigid body (needs `area()`). `body()` is dynamic, `body({ isStatic })` fixed, `body({ kinematic })` moved by code. Dynamic bodies are rendered **interpolated** (see below); `body({ interpolate: false })` opts out. Adds `vel`, `angularVel`, `applyImpulse`, `applyForce`, `applyTorqueImpulse`, `jump`, `isGrounded`, `isFalling`, `onGround`, `teleport`. |
| `character(opts?)` | Kinematic character controller (needs `area()`, not combinable with `body()`): `move()` slides along walls, climbs steps and slopes, falls with gravity (only the x/z part of `move()` is used). Adds `vel`, `jump`, `isGrounded`, `isFalling`, `onGround`, `teleport`. |
| `setGravity(n \| vec)` / `getGravity()` | A number pulls down (default **20**). |
| `raycast(origin, dir, maxDist?, { exclude, tag, sensors }?)` | First hit as `{ obj, point, normal, distance }` or `null`. |
| `onCollide(tagA, tagB, fn)` (+ `Update`, `End`) | Global listeners, scoped to the scene (removed by `go()`). |
| `physics` | The backend: `physics.world` (a `RAPIER.World`) and `physics.native` (the `RAPIER` module). |

Options: `threeplay({ physics: false })` disables it (Rapier is not downloaded and components are
inert, with one console warning); `threeplay({ physics: { gravity: 12 } })` sets gravity.

`area({ shape, size, offset, sensor, friction, restitution })`: the collider comes from `obj.shape`
(box, sphere, capsule, cylinder, cone, plane; mesh and model use the bounding box). `shape: "mesh"`
builds a trimesh (not for dynamic bodies, which fall back to a hull) and `"hull"` a convex hull.
`size` and `offset` are in the object's local units (multiplied by its scale).

## Example

```js
const k = threeplay();

k.add([k.pos(0, -0.5, 0), k.box(40, 1, 40), k.area(), k.body({ isStatic: true }), "floor"]);

const player = k.add([
  k.pos(0, 2, 0),
  k.capsule(0.4, 1.8),
  k.area(),
  k.character({ stepHeight: 0.3 }),
  "player",
]);
k.onUpdate(() => {
  player.move(k.isKeyDown("d") ? 5 : 0, 0, 0);
  if (k.isKeyPressed("space") && player.isGrounded()) player.jump();
});

k.add([k.pos(4, 1, 0), k.sphere(0.4), k.area(), "coin"]);
k.onCollide("player", "coin", (_player, coin) => coin.destroy());
```

## How it works

- A body and its collider are created once the object has all its components (`objectAdd` hook), or
  on the next fixed step for components added to a live object and for objects added before Rapier
  finished loading. Changing the components of a live object rebuilds the body.
- Fixed step (`beforeFixedUpdate` / `afterFixedUpdate`, 50 Hz): area-only, kinematic and character
  objects push their world transform to the world; dynamic bodies write theirs back to `object3d`
  (in local space, `rot` follows). A dynamic body whose object was moved by code is teleported.
  Area-only and kinematic objects are pushed to the world only when their world transform changed.
- **Interpolation.** Rendering usually does not line up with the 50 Hz steps (60/120/144 Hz screens),
  so dynamic bodies would stutter. Physics keeps the last two simulated poses of every dynamic body
  and, in `beforeUpdate`, writes the pose interpolated by the fraction of a step still pending to
  `object3d` (it mirrors the core's accumulator from `frameStart`/`afterFixedUpdate`). So `update`
  code and the camera (`afterUpdate`) see the visual pose, up to one step (20 ms) behind the
  simulation. `fixedUpdate` and collision callbacks see the latest simulated pose; `vel`,
  `isGrounded()`, `raycast` and the debug colliders always use the simulation. Assigning `pos`/`rot`
  from code is detected (against the last pose physics wrote) and teleports the body.
- Collisions: `collide` once, `collideUpdate` every fixed step, `collideEnd` on separation or
  destruction (survivors get `collideEnd` when the other object is destroyed).
- Characters step in `afterUpdate`, once per rendered frame, so a camera following them never jitters.

## Gotchas

- **The collider follows the object's own scale**: changing `obj.scale` (to crouch, grow, squash) swaps the collider for one of the new size on the next fixed step, keeping the body's pose and velocity; contacts end and start again. Scaling a **parent** later does not resize its children's colliders.
- **Static bodies do not follow code**: moving a `body({ isStatic })` object by hand has no effect on
  collisions, and `move()` on one does nothing (it warns once). Use `body({ kinematic: true })` for
  moving platforms.
- **`obj.pos` of a dynamic body is the visual pose** (see Interpolation): up to one fixed step behind
  the simulation. Use `body({ interpolate: false })` if you need the latest simulated pose in `update`
  (at the cost of jitter).
- **Characters only move horizontally through `move()`/`moveTo()`**: the vertical part of the delta is
  dropped (height comes from gravity and `jump()`), and writing `vel.x`/`vel.z` does nothing; `vel.y`
  is writable (`vel.y = 5`).
- **Calls on destroyed objects** (`vel`, `isColliding()`, `getCollisions()`, `isGrounded()`...) return
  defaults (zero vector, `false`, `[]`) and do not recreate any state.
- **`body()` and `character()` exclude each other** (`conflicts`); combining them throws
  `Components "body" and "character" can't be on the same object`.
- **`move()` on a dynamic body sets its horizontal velocity** (x/z) every call and keeps y. If you stop
  calling it the body keeps sliding until friction stops it; use `damping` or call `move(0)`.
- **`applyForce()`** acts during the fixed steps of the next frame and is then cleared: call it every
  frame while the force should last. `applyImpulse()` is instantaneous.
- **Ground probe** (`body().isGrounded()`) is a short ray down from the collider bottom: approximate
  for tumbling bodies; use `lockRotation` for player-like boxes.
- **Characters assume Y-up gravity** and top-level objects (their `move()` delta is in world space).
- A character only climbs steps shorter than `stepHeight` and slopes up to `maxSlope`.
- Queries (`raycast`, character movement) see colliders after the first physics step that follows
  their creation.
- Angular velocity is in degrees per second in the public API (radians inside Rapier).
