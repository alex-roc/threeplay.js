# gameplay

Common game-logic components. No dependencies.

## API

- `health(hp, maxHp = hp)` — `hp` (clamped to 0…`maxHp`; `obj.hp -= 1` works too), `hurt`, `heal`,
  `setHP`. Object events `"hurt"`, `"heal"`, `"death"` (fires once until hp is above 0 again);
  helpers `onHurt`, `onHeal`, `onDeath`.
- `state(initial, allowed?)` — `state`, `enterState(name, ...args)` (throws for names not in
  `allowed`), `onStateEnter/onStateEnd/onStateUpdate(name, fn)`. The initial state is entered on
  the first frame, so handlers registered after `add([...])` still see it.
- `lifespan(seconds, { fade = 0 })` — destroys the object; with `fade` and an `opacity`
  component it fades out during the last `fade` seconds.
- `timer()` — `wait`, `loop`, `tween` bound to the object: they tick in its update (so
  `obj.paused` stops them) and die with it. Same signatures as the `k.` versions.
- `offscreen({ distance = 100, destroy = false, frustum = false })` — `isOffScreen()`,
  events `"exitScreen"` / `"enterScreen"` (`onExitScreen`, `onEnterScreen`). Distance is measured
  to `k.camera3d`; `frustum` also tests the camera view (the `mesh` bounds if the object has one).

## Example

```js
const enemy = add([
  pos(0, 0, -10), sphere(0.5), color("crimson"),
  health(3), state("patrol", ["patrol", "chase"]), timer(), offscreen({ distance: 60, destroy: true }),
]);

enemy.onDeath(() => { enemy.destroy(); k.beep({ freq: 200, slideTo: 60 }); });
enemy.onStateEnter("chase", () => enemy.wait(2, () => enemy.enterState("patrol")));
enemy.onStateUpdate("patrol", () => enemy.move(0, 0, 2));

add([pos(0, 2, 0), sphere(0.2), opacity(1), lifespan(1.5, { fade: 0.5 })]); // a fading puff
```
