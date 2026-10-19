---
title: Position, rotation and scale
description: The 3D coordinate system, the pos, rotate, scale and follow components, and the math helpers.
sidebar:
  order: 3
---

## The coordinate system

- **Units are meters.** A character is about 1.8 m tall, a door about 2 m.
- **Y is up.** The ground plane is XZ.
- **−Z is forward**, +X is right. Cameras, lights and `forward()` all agree on this.
- **Angles are in degrees** everywhere in the public API (three.js uses radians internally; threeplay converts for you).

```js
import threeplay from "threeplay";

threeplay({ background: "#0b132b" });

add([plane(30), color("#1c2541")]);

// A pivot that spins, with a planet 4 m away from it: a child orbits its parent.
add([sphere(1), pos(0, 2, 0), color("gold")]);
const pivot = add([pos(0, 2, 0), rotate()]);
const planet = pivot.add([sphere(0.4), pos(4, 0, 0), color("skyblue")]);
onUpdate(() => pivot.rotateBy(40 * dt())); // one argument: degrees around Y

// A beam that keeps pointing at the planet.
const beam = add([box(0.3, 0.3, 2), pos(-6, 1, 0), rotate(), color("tomato")]);
onUpdate(() => beam.lookAt(planet));

// A marker that follows the planet, one meter above it.
add([sphere(0.15), pos(), follow(planet, vec3(0, 1, 0)), color("white")]);

camPos(0, 10, 12);
camLookAt(vec3(0, 2, 0));
```

## Position: `pos`

```js
const crate = add([box(1), pos(2, 0.5, -3)]);   // x, y, z
add([box(1), pos(vec3(1, 2, 3))]);             // from a vector
add([box(1), pos()]);                          // (0, 0, 0)
```

`crate.pos` is a `THREE.Vector3` and it **is** the node's `position`: edit it in place or replace it (assigning copies the value).

```js
crate.pos.y += 1;
crate.pos.set(0, 2, 0);
crate.pos = vec3(4, 0.5, 0);
```

A `pos` is **local to the parent**. For a top-level object that is the world position. For a child, use `worldPos()` to get where it really is (a new vector each call):

```js
planet.pos;          // (4, 0, 0), relative to the pivot
planet.worldPos();   // where it is in the world right now
planet.setWorldPos(vec3(0, 5, 0));   // sets the world position, converting for you
planet.distanceTo(crate);            // to another object, or to any {x, y, z}
```

### Moving

`move()` takes a **velocity in meters per second**; it multiplies by the frame time for you. Call it every frame:

```js
onUpdate(() => {
  crate.move(2, 0, 0);          // 2 m/s along +X
  crate.move(vec3(0, 0, -1));   // from a vector
});
```

`move(5)` is `move(5, 0, 0)`: a single number only sets X.

When the object has a component that handles movement ([`character()`](/threeplay.js/guides/physics/) or `body()`), `move()` hands the movement over to it, so the object slides along walls instead of passing through them. Without one, `move()` just changes `pos`.

`moveTo(target, speed?)` heads towards a point (a vector or another object). With `speed` it moves that many meters per second (call it every frame, it goes through `move()` too); without `speed` it jumps there.

```js
enemy.moveTo(player, 3);                         // chase at 3 m/s, in 3D
enemy.moveTo(vec3(player.pos.x, enemy.pos.y, player.pos.z), 3);   // stay at the same height
```

`moveTo` moves in all three axes: aim at a point with your own Y to stay on the ground.

## Rotation: `rotate`

`rotate()` adds `rot`, a vector of Euler angles in degrees (X, Y, Z, in three.js' default XYZ order).

```js
add([box(1), rotate(30)]);          // a single number turns around Y
add([box(1), rotate(20, 30, 0)]);   // x, y, z
const sign = add([box(2, 1, 0.1), pos(0, 1, 0), rotate()]);

sign.rot.y = 90;
sign.rot.y += 45 * dt();      // spin
sign.rotateBy(10);            // one number adds degrees around Y
sign.rotateBy(0, 10, 5);      // or x, y, z
```

Positive **Y** rotation turns the object to its **left** (counter-clockwise seen from above). `rot` and the three.js node are kept in sync both ways, so physics, `lookAt()` and your own code can all change the rotation, and `rot` always shows the current value.

### Rotation order

With all three angles in play (aircraft, spaceships, a car on a slope) the order matters. The default `"XYZ"` tilts around the world axes, so pitching a plane that has turned 90° tilts it sideways. Set `rotOrder = "YXZ"` and the angles read as a pilot expects: heading (`rot.y`), then pitch (`rot.x`), then roll (`rot.z`).

```js
const plane = add([box(1, 0.3, 2), pos(0, 20, 0), rotate()]);
plane.rotOrder = "YXZ";
plane.rot.set(10, 90, -30);   // nose up 10°, heading 90°, banked 30° to the right
```

### Facing directions

```js
sign.forward();   // unit vector the object faces: its local −Z, in world space
sign.right();     // its local +X in world space
sign.lookAt(player);              // turn to face an object or a point
sign.lookAt(vec3(0, sign.pos.y, 0));   // face a point at your own height: yaw only
```

`lookAt` also pitches the object when the target is above or below it. To turn only around Y (characters, enemies), look at a point with the object's own height, as above.

`forward()` is how you move "where I'm facing":

```js
onUpdate(() => car.move(car.forward().multiplyScalar(speed)));
```

## Scale: `scale`

```js
add([box(1), scale(2)]);          // uniform
add([box(1), scale(1, 3, 1)]);    // x, y, z
const rock = add([sphere(1), scale()]);   // no arguments: (1, 1, 1)

rock.scale.y = 2;
rock.scaleTo(0.5);                // uniform again
```

Scale applies to the object's shape **and its children**. Changing the scale of a physics object also resizes its collider on the next fixed step, so `player.scale.y = 0.5` really crouches (see [Physics](/threeplay.js/guides/physics/)).

## Following another object: `follow`

`follow(target, offset)` keeps the object at `target.worldPos() + offset` every frame. It needs `pos()` and only copies the position (not rotation). Change `obj.follow.target` or `obj.follow.offset` at any time.

```js
const label = add([sphere(0.1), pos(), follow(player, vec3(0, 2, 0)), color("white")]);
label.follow.target = otherPlayer;
```

If you want the follower to also move and turn exactly like the target, make it a **child** of the target instead (`target.add([...])`): it inherits the whole transform.

## Math helpers

Every one of these is a plain function on the engine (and on `window` in global mode).

| Helper | Returns |
| --- | --- |
| `vec3(x?, y?, z?)` | A `THREE.Vector3`. `vec3()` is (0, 0, 0), `vec3(2)` is (2, 2, 2), `vec3(v)` copies `v`. |
| `vec2(x?, y?)` | A `THREE.Vector2` (screen and HUD coordinates). |
| `rgb(r, g, b)` | A `THREE.Color` from 0–255 channels. Also accepts anything three.js understands: `rgb("tomato")`, `rgb("#ff7800")`, `rgb(0xff7800)`, `rgb([255, 120, 0])`. `rgb()` is white. |
| `rand()`, `rand(n)`, `rand(a, b)` | A random number in 0–1, 0–n or a–b. |
| `randi(n)`, `randi(a, b)` | A random integer, `a` included and `b` excluded. |
| `choose(list)` | A random element of an array. |
| `chance(p)` | `true` with probability `p` (0–1). |
| `lerp(a, b, t)` | Linear interpolation. |
| `clamp(v, min, max)` | Limits `v` to a range. |
| `map(v, l1, h1, l2, h2)` | Maps `v` from one range to another. |
| `wave(lo, hi, t)` | Oscillates between `lo` and `hi` as `t` grows (one cycle every 2π): `wave(0.9, 1.1, time() * 3)`. |
| `deg2rad(deg)`, `rad2deg(rad)` | Angle conversion, for when you talk to three.js directly. |
| `easings` | Easing functions for [`tween`](/threeplay.js/guides/scenes-and-events/#timers). |

`vec3` and `rgb` return three.js objects, so all of their methods work: `a.add(b)`, `a.clone().multiplyScalar(2)`, `a.distanceTo(b)`, `color.lerp(other, 0.5)`, `a.normalize()`...

:::caution
Vector methods like `add` and `multiplyScalar` **change the vector** they are called on. Never mutate a vector you don't own (such as `obj.pos` or a constant shared by several objects) when you meant to compute a new value. Call `.clone()` first:

```js
const next = player.pos.clone().add(vec3(0, 1, 0));   // player.pos is untouched
```
:::
