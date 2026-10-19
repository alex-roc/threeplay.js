---
title: Camera
description: Place the camera by hand, or let a controller drive it - follow, first person, third person, orbit and top-down - plus screen shake.
sidebar:
  order: 7
---

There is one camera, a `THREE.PerspectiveCamera` at `k.camera3d`. You can place it yourself, or start a **camera controller** that moves it every frame. Press 1 to 4 in this example to try them all, and space to shake:

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#cdeac0" });

scene("main", () => {
  add([box(60, 1, 60), pos(0, -0.5, 0), color("#95d5b2"), area(), body({ isStatic: true })]);
  for (let i = 0; i < 12; i++) {
    const p = vec3(rand(-20, 20), 0, rand(-20, 20));
    add([cylinder(0.5, 4), pos(p.x, 2, p.z), color("#7f5539"), area(), body({ isStatic: true })]);
  }

  const player = add([
    capsule(0.45, 1.7),
    pos(0, 1, 0),
    rotate(),
    color("#277da1"),
    area(),
    character(),
    "player",
  ]);
  player.add([box(0.25, 0.25, 0.4), pos(0, 0.45, -0.45), color("#f9c74f")]); // a nose: shows where it faces

  // Movement is relative to the camera, so it works with every controller below.
  onUpdate(() => {
    const dir = inputDir();
    player.move(dir.clone().multiplyScalar(6));
    // In first person the camera decides where the player faces.
    if (dir.lengthSq() > 0 && getCameraController()?.mode !== "firstPerson") {
      player.lookAt(player.worldPos().add(dir));
    }
  });
  onButtonPress("jump", () => player.isGrounded() && player.jump(9));

  const modes = {
    1: () => camFollow(player, { offset: vec3(0, 5, 9), smooth: 0.1 }),
    2: () => thirdPerson(player, { distance: 7, height: 1.4 }),
    3: () => firstPerson(player, { height: 0.6 }),
    4: () => topDown(player, { height: 18, angle: 20 }),
  };
  for (const [key, start] of Object.entries(modes)) {
    onKeyPress(key, () => {
      start();
      player.hidden = key === "3"; // hide the body in first person
    });
  }
  modes[1]();

  onKeyPress("space", () => camShake(0.4, 0.3));
  add([text("1 follow · 2 third person · 3 first person · 4 top down · space shake", { size: 14 }), pos(20, 510), fixed()]);
});

go("main");
```

## Placing the camera by hand

```js
camPos(0, 6, 12);              // set the position (x, y, z or a vector)
camPos();                      // read it (a copy)
camLookAt(vec3(0, 1, 0));      // a point...
camLookAt(player);             // ...or an object
camFov(75);                    // vertical field of view, degrees
camFov();                      // read it
```

This is all you need for a fixed camera, like a menu or an arena seen from one side. The camera starts at (0, 5, 10), looking at the origin, with a field of view of 60. If a controller is running, it overrides your position and look-at on the next frame, so stop it first (`controller.stop()`).

## Camera controllers

Each function below starts a behavior and returns its controller. Only one is active at a time: starting another stops the previous one. `controller.stop()` stops it and leaves the camera where it is, and `getCameraController()` returns the active one (or `null`). Every controller has a read-only `mode`.

Controllers run after physics, so a character that moved this frame is already in its final position and the camera never jitters.

### `camFollow(target, options)`

A chase camera that stays at an offset from the target.

```js
camFollow(player);   // 4 m up and 8 m towards +Z of the player, looking at it
camFollow(player, { offset: vec3(0, 5, 9), smooth: 0.1, lookAt: true, rotateWithTarget: false });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `offset` | `(0, 4, 8)` | Where the camera sits relative to the target. |
| `smooth` | `0.1` | 0 is instant; closer to 1 is smoother and slower. Independent of the frame rate. |
| `lookAt` | `true` | Look at the target. |
| `rotateWithTarget` | `false` | Rotate the offset with the target's yaw (`rot.y`), for a camera that stays behind a car. |

### `firstPerson(target, options)`

Mouse-look from the target's eyes.

```js
const fps = firstPerson(player, { height: 0.6, sensitivity: 0.15 });
onUpdate(() => player.move(inputDir().multiplyScalar(5)));   // forward is where you look
```

| Option | Default | Meaning |
| --- | --- | --- |
| `height` | `0.7` | Eye height over the object's origin. |
| `sensitivity` | `0.15` | Degrees per pixel of mouse movement. |
| `lockOnClick` | `true` | Click the canvas to lock the pointer. The mouse only looks around while it is locked. With `false` it always looks around. |
| `maxPitch` | `85` | How far up and down you can look, in degrees. |

If the target has `rotate()`, its `rot.y` is set to the camera's yaw, so `player.forward()` is where you look. The controller exposes `yaw` and `pitch` (degrees; yaw 0 faces −Z and positive turns left; positive pitch looks up) for you to read or set. The target stays visible: hide it (`player.hidden = true`) if it would block your view. Remember to `unlockPointer()` in menu and game over scenes.

### `thirdPerson(target, options)`

An over-the-shoulder camera that orbits the target with the mouse.

```js
const cam = thirdPerson(player, { distance: 8, height: 1.2 });
cam.yaw += 45;   // read or set cam.yaw, cam.pitch, cam.distance
```

| Option | Default | Meaning |
| --- | --- | --- |
| `distance` | `6` | Distance to the target. |
| `height` | `1` | Height of the point the camera looks at, over the target's origin. |
| `sensitivity` | `0.15` | Degrees per pixel. |
| `shoulder` | `0` | Over-the-shoulder offset in meters: the camera and its look-at point move to the right (negative: left), so the target sits off-center and the screen center is free for a crosshair, as in third-person shooters. Change `controller.shoulder` to switch sides. |
| `avoidWalls` | `true` | Pull the camera in when a wall is between it and the target (needs physics). |
| `lockOnClick` | `false` | Lock the pointer on click. By default you drag with the left or right button to look around. |
| `minPitch`, `maxPitch` | `-20`, `60` | Elevation limits, degrees. |

It starts behind the target's heading. When a wall gets in the way the camera jumps in front of it at once and eases back out when the way is clear.

### `orbitCamera(options)`

Orbits around a point or an object: inspectors, menus, sandboxes.

```js
orbitCamera({ target: vec3(0, 2, 0), distance: 16 });
orbitCamera({ target: player, autoRotate: 20 });   // follows the object, turning 20 degrees per second
```

| Option | Default | Meaning |
| --- | --- | --- |
| `target` | the origin | A point, or an object that is tracked every frame. |
| `distance` | `10` | Starting distance. |
| `interactive` | `true` | Drag to orbit, wheel to zoom. |
| `autoRotate` | `0` | Degrees per second. |
| `minDistance`, `maxDistance` | `2`, `50` | Zoom limits. |

It starts from wherever the camera already is, so the view doesn't jump. The controller has `yaw`, `pitch`, `distance` and `target`.

### `topDown(target, options)`

Looks down at the target from above, with a fixed tilt. Good for arcade and strategy games.

```js
topDown(player, { height: 15, angle: 30, smooth: 0.1 });
```

`height` is the height over the target, `angle` the tilt away from straight down (0 is exactly overhead; the view points towards −Z), and `smooth` works like in `camFollow`.

## Shake

```js
camShake();            // intensity 0.3, duration 0.4 s
camShake(0.6, 0.5);    // a bigger, longer one
```

The camera is offset by a random amount that decays to zero over `duration`. The shake is applied on top of whatever the controller does and removed again the next frame, so it never accumulates or disturbs smoothing.

## Directions: `camForward` and `camRight`

```js
camForward();   // unit vector on the XZ plane: where the camera looks, flattened
camRight();     // unit vector to the camera's right, also flattened
```

They are what `inputDir()` uses to make movement relative to the camera. Use them for your own movement code or for pushes in the direction the player looks:

```js
crate.applyImpulse(camForward().multiplyScalar(8));
```

## Controllers reset on scene change

When a scene starts, the active controller stops and the camera goes back to its default view. That is what you want in most games, but it means you start the controller **inside the scene**:

```js
scene("level1", () => {
  const player = add([/* ... */]);
  camFollow(player);       // here, not at the top level
});
```

A `camFollow()` at the top level of your file runs once, and the first `go()` resets it. (Camera calls made before any scene starts, as in a game without scenes, are fine.)

## Using your own camera

`k.camera3d` is a plain three.js camera: change its `near`, `far` or `position`, or even assign a different one with `k.camera3d = myCamera`. The renderer keeps the aspect ratio in sync with the canvas for whichever camera is active. Call `camera3d.updateProjectionMatrix()` after changing lens properties such as `near` and `far`.
