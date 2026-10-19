# camera

Camera behaviors on `k.camera3d`. Depends on `render`, `transform` and `input`.

```js
k.scene("fps", () => {
  const player = k.add([k.pos(0, 1, 0), k.rotate(), k.character()]);
  k.firstPerson(player);                       // click the canvas to lock the mouse
  k.onUpdate(() => player.move(k.inputDir().multiplyScalar(5)));  // camera-relative, so it follows the look
});

k.scene("rpg", () => {
  k.camFollow(player, { offset: k.vec3(0, 5, 9), smooth: 0.1 });
  k.onKeyPress("space", () => k.camShake(0.4, 0.3));
});
```

## Rules

- A behavior runs in the **`afterUpdate`** hook, after physics (install order), so character
  controllers have already moved. Only one is active: starting another stops the previous
  one; `controller.stop()` leaves the camera where it is. `getCameraController()` returns it.
- On `sceneEnter` the controller stops and the camera resets to `(0, 5, 10)` looking at the
  origin, fov 60.
- Smoothing is frame-rate independent: `t = 1 − smooth^(dt·60)`; `smooth: 0` is instant.
- Convention: **−Z is forward** for cameras and objects; angles in degrees; yaw turns left
  when positive; mouse right turns right.

## Behaviors

| Call | Notes |
| --- | --- |
| `camFollow(target, { offset = (0,4,8), smooth = 0.1, lookAt = true, rotateWithTarget = false })` | Chase camera; `rotateWithTarget` rotates the offset with the target's yaw. |
| `firstPerson(target, { height = 0.7, sensitivity = 0.15, lockOnClick = true, maxPitch = 85 })` | Eyes at `target.worldPos() + (0, height, 0)`. Mouse → yaw/pitch (only while the pointer is locked when `lockOnClick`). Writes yaw to `target.rot.y` if it has `rotate()`, so `target.forward()` is where you look. The lock request runs inside the click gesture (a DOM listener on the canvas). Hides nothing. |
| `thirdPerson(target, { distance = 6, height = 1, shoulder = 0, sensitivity = 0.15, avoidWalls = true, lockOnClick = false, minPitch = -20, maxPitch = 60 })` | Orbits while dragging (left/right button) or always when locked. Starts behind the target's heading. `shoulder` shifts camera and look point along the camera's horizontal right (the side ray is also wall-checked). `avoidWalls` casts `k.raycast` from the look point to the camera (excluding the target) when the physics plugin exists; pulls in at once, eases back out. The ignored objects (the target and its children) are collected the first time the ray is cast: children added to the target later are not ignored. |
| `orbitCamera({ target = (0,0,0), distance = 10, interactive = true, autoRotate = 0, minDistance = 2, maxDistance = 50 })` | Drag to orbit, wheel to zoom (exponential). `target` may be a vector or an object (tracked). Starts from the current camera direction. |
| `topDown(target, { height = 15, angle = 30, smooth = 0.1 })` | Fixed tilt (`angle` from straight down, looking towards −Z); the position follows the target. |

`FirstPersonController`, `ThirdPersonController` and `OrbitController` expose `yaw`/`pitch`
(and `distance`, `target`) to read or set at any time.

## Helpers

`camPos(x, y, z)` / `camPos()` (a copy), `camLookAt(target)`, `camFov(deg?)`,
`camForward()` / `camRight()` (XZ, unit), `camShake(intensity = 0.3, duration = 0.4)`.

`camShake` adds a decaying random offset **after** the controller and removes it at the start
of the next `afterUpdate`, so it never accumulates or leaks into smoothing.

## Files

- `index.ts` – the plugin.
- `math.ts` – pure helpers: `smoothFactor`, `orbitOffset`, `offsetAngles`, `yawOfDirection`,
  `horizontalForward`.
- `camera.test.ts` – tests (the mouse is faked, no DOM needed).
