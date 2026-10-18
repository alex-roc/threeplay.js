---
title: Gameplay components
description: Hit points, state machines, timed objects, object timers and offscreen detection - the building blocks of most game logic.
sidebar:
  order: 11
---

Five small components cover a lot of ground: `health`, `state`, `lifespan`, `timer` and `offscreen`. This example uses all of them: a guard that patrols, gets stunned when you shoot it, and is defeated after three hits, while your bullets fade out and clean themselves up.

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#1b1b2f" });

scene("main", () => {
  add([plane(40), color("#33415c"), area(), body({ isStatic: true })]);

  const player = add([capsule(0.4, 1.6), pos(0, 0.8, 7), rotate(), color("#f77f00"), area(), character(), health(5), "player"]);
  camPos(0, 9, 14);
  camLookAt(vec3(0, 0, 0));

  const guard = add([
    box(1, 1.6, 1),
    pos(-6, 0.8, -3),
    color("crimson"),
    area(),
    character(),
    health(3),
    state("patrol", ["patrol", "stunned"]),
    timer(),
    "guard",
  ]);

  // State machine: walk back and forth, freeze for a moment when hit
  let dir = 1;
  guard.onStateUpdate("patrol", () => {
    guard.move(3 * dir, 0, 0);
    if (Math.abs(guard.pos.x) > 8) dir = -Math.sign(guard.pos.x);
  });
  guard.onStateEnter("stunned", () => {
    guard.color.set("white");
    guard.wait(0.8, () => {
      guard.color.set("crimson");
      guard.enterState("patrol");
    });
  });
  guard.onHurt(() => guard.enterState("stunned"));
  guard.onDeath(() => {
    beep({ freq: 200, slideTo: 50, duration: 0.4 });
    guard.destroy();
    add([text("Guard defeated!", { size: 36 }), pos(480, 270), anchor("center"), fixed(), lifespan(3)]);
  });

  // Shooting: bullets clean themselves up
  onKeyPress("space", () => {
    const bullet = add([
      sphere(0.15),
      pos(player.worldPos()),
      color("yellow"),
      opacity(1),
      area(),
      lifespan(2, { fade: 0.5 }),
      offscreen({ distance: 40, destroy: true }),
      "bullet",
    ]);
    bullet.onUpdate(() => bullet.move(0, 0, -14));
    bullet.onCollide("guard", (g) => {
      g.hurt(1);
      bullet.destroy();
    });
  });

  // Player takes damage while touching the guard (at most once a second)
  let invulnerable = false;
  player.onCollideUpdate("guard", () => {
    if (invulnerable) return;
    invulnerable = true;
    player.hurt(1);
    camShake(0.3, 0.3);
    wait(1, () => (invulnerable = false));
  });
  player.onDeath(() => go("main"));

  onUpdate(() => player.move(inputDir().multiplyScalar(6)));
  const hud = add([text("", { size: 20 }), pos(20, 16), fixed()]);
  onUpdate(() => (hud.text = `HP ${player.hp}/${player.maxHp}`));
  add([text("WASD move, space shoots", { size: 14 }), pos(20, 510), fixed()]);
});

go("main");
```

## `health(hp, maxHp = hp)`

```js
const enemy = add([sphere(0.5), pos(0, 1, 0), health(3)]);          // 3 hit points, max 3
const boss = add([sphere(2), pos(0, 2, 0), health(50, 100)]);       // starts at 50 of 100

enemy.hp;            // 3
enemy.hurt();        // 1 damage; enemy.hurt(2) for more
enemy.heal(1);       // restores, never above maxHp
enemy.setHP(10);     // set directly (clamped to 0..maxHp), no hurt/heal event
enemy.hp -= 1;       // also works: it is clamped and can kill, but it sends no "hurt" event
```

`hp` is always between 0 and `maxHp`. Reacting to changes:

```js
enemy.onHurt((amount) => { /* flash red */ });
enemy.onHeal((amount) => {});
enemy.onDeath(() => enemy.destroy());
```

These are the object events `"hurt"`, `"heal"` and `"death"`, so you can also listen to a whole group of objects with a tag:

```js
on("death", "enemy", (e) => { score += 10; e.destroy(); });
on("hurt", "player", (p, amount) => camShake(0.2, 0.2));
```

`"death"` fires once when `hp` reaches 0, and fires again only if the object was healed above 0 and dies again. The object is **not** destroyed for you: decide what death means (destroy it, play an animation, change scene).

## `state(initial, allowed?)`

A small finite state machine. Instead of a pile of booleans, give the object a named state and attach behavior to each one.

```js
const npc = add([box(1, 2, 1), pos(0, 1, 0), state("idle", ["idle", "chase", "flee"])]);

npc.state;                   // "idle"
npc.enterState("chase");     // leaves "idle" and enters "chase"
npc.enterState("flee", player);   // extra arguments go to the enter handlers
npc.state = "idle";          // same as enterState("idle")

npc.onStateEnter("chase", (target) => debug.log("chasing", target));
npc.onStateEnd("chase", () => debug.log("stopped chasing"));
npc.onStateUpdate("chase", () => npc.moveTo(player, 3));   // every frame while in "chase"
```

- The optional `allowed` list makes typos fail loudly: `enterState("chaze")` throws `State "chaze" is not allowed. Allowed states: ...`.
- The initial state is **entered on the first frame**, so handlers you register right after `add([...])` still see it.
- `onStateUpdate` does not run while the object is paused.
- Handlers belong to the object and die with it.

## `lifespan(seconds, { fade })`

Destroys the object after `seconds`. With `fade` and an `opacity()` component, it fades out during the last `fade` seconds. Perfect for bullets, particles and temporary messages.

```js
add([sphere(0.2), pos(0, 2, 0), opacity(1), lifespan(1.5, { fade: 0.5 })]);   // visible 1 s, then fades for 0.5 s
add([text("Saved!", { size: 28 }), pos(480, 80), anchor("center"), fixed(), lifespan(2)]);
```

## `timer()`

Adds `wait`, `loop` and `tween` **to the object**, with the same signatures as the global ones (see [Timers](/threeplay.js/guides/scenes-and-events/#timers)). The difference is the life of the timer:

```js
const turret = add([box(1), pos(0, 0.5, 0), timer()]);

turret.loop(2, () => shoot());                      // every 2 s while the turret exists
turret.wait(5, () => turret.color.set("red"));
turret.tween(0, 1, 0.5, (v) => (turret.pos.y = v), easings.easeOutQuad);
```

These timers tick in the object's own update, so **`turret.paused = true` pauses them**, and they disappear when the object is destroyed. A global `wait()` keeps running when an object is paused and fires even if the object is gone, which is why the earlier examples check `exists()`. Prefer the component's timers for behavior that belongs to the object.

## `offscreen(options)`

Detects when an object is far from the camera, or outside its view.

```js
add([sphere(0.2), pos(), offscreen({ distance: 40, destroy: true })]);   // clean up stray bullets

const enemy = add([box(1), pos(0, 1, -30), offscreen({ distance: 25 })]);
enemy.onExitScreen(() => debug.log("enemy left"));
enemy.onEnterScreen(() => debug.log("enemy is back"));
enemy.isOffScreen();   // as of the last frame
```

| Option | Default | Meaning |
| --- | --- | --- |
| `distance` | `100` | Meters from the camera beyond which the object counts as offscreen. |
| `destroy` | `false` | Destroy the object when it goes offscreen. |
| `frustum` | `false` | Also count the object as offscreen when it is outside the camera's view (uses the bounds of its `mesh`, or its position). |

:::note
By default `offscreen` only looks at the **distance** to the camera, not at what is visible: a bullet fired away from the view is "onscreen" until it is `distance` meters away. Turn on `frustum: true` to use the camera's view as well. An object that starts offscreen emits `"exitScreen"` on its first frame.
:::
