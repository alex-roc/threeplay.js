# threeplay

## 0.2.0

### Minor Changes

- c20c2d4: `rotate()` gains `rotOrder` (default `"XYZ"`): set it to `"YXZ"` so `rot` reads as heading, pitch and roll, as aircraft and vehicles need. `lookAt()` now keeps the object's rotation order instead of resetting it to XYZ.
- 1737824: `thirdPerson({ shoulder })`: an over-the-shoulder offset that moves the camera and its look-at point to the side, leaving the screen center free for aiming. `controller.shoulder` switches sides at runtime.

### Patch Changes

- 64dde88: The collider of a physics object now follows changes to the object's own scale (crouching with `obj.scale.y = 0.5`, growing, squashing): it is rebuilt at the new size on the next fixed step, keeping the body's pose and velocity. Before, the scale was baked in when the body was created.

## 0.1.0

### Minor Changes

- 54c0ab0: First release: kaplay-style core (game objects, components, tags, scenes, events, timers, plugins) and built-in plugins for rendering (WebGPU with WebGL2 fallback), shapes, transform, Rapier physics (area, body, character), input, cameras, DOM HUD, ASCII levels, glTF assets and animations, audio, gameplay components and a debug inspector.
