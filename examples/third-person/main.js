// Third-person adventure: explore, kick crates, and avoid the guard.
// Shows thirdPerson(), state() machines, child objects and timers.
import threeplay from "threeplay";

threeplay({
  width: 960,
  height: 540,
  background: "#cdeac0",
  buttons: {
    left: { keyboard: ["left", "a"], gamepad: "dpad-left" },
    right: { keyboard: ["right", "d"], gamepad: "dpad-right" },
    up: { keyboard: ["up", "w"], gamepad: "dpad-up" },
    down: { keyboard: ["down", "s"], gamepad: "dpad-down" },
    jump: { keyboard: "space", gamepad: "south" },
    kick: { keyboard: ["e", "k"], mouse: "left", gamepad: "west" },
  },
});

const WAYPOINTS = [vec3(-8, 0, -8), vec3(8, 0, -8), vec3(8, 0, 8), vec3(-8, 0, 8)];

scene("world", () => {
  setGravity(25);
  add([box(40, 1, 40), pos(0, -0.5, 0), color("#95d5b2"), area(), body({ isStatic: true })]);
  for (let i = 0; i < 12; i++) {
    const p = vec3(rand(-15, 15), 0, rand(-15, 15));
    add([cylinder(0.3, 2), pos(p.x, 1, p.z), color("#7f5539"), area(), body({ isStatic: true })]);
    add([sphere(1.2), pos(p.x, 2.6, p.z), color("#2d6a4f")]);
  }
  for (let i = 0; i < 8; i++) {
    add([
      box(1, 1, 1),
      pos(rand(-6, 6), 0.5, rand(-6, 6)),
      color("#dda15e"),
      area(),
      body({ mass: 2 }),
      "crate",
    ]);
  }

  // The player: a capsule with a "nose" child that shows where it faces.
  const player = add([
    capsule(0.45, 1.7),
    pos(0, 1, 4),
    rotate(),
    color("#277da1"),
    area(),
    character(),
    "player",
  ]);
  player.add([box(0.25, 0.25, 0.4), pos(0, 0.45, -0.45), color("#f9c74f")]);
  thirdPerson(player, { distance: 7, height: 1.4 });

  // The guard patrols between waypoints and chases the player when close.
  const guard = add([
    box(1, 1.8, 1),
    pos(-8, 0.9, -8),
    rotate(),
    color("#d62828"),
    area(),
    character(),
    state("patrol", ["patrol", "chase", "rest"]),
    "guard",
  ]);
  let target = 1;
  guard.onStateUpdate("patrol", () => {
    const wp = WAYPOINTS[target];
    guard.moveTo(vec3(wp.x, guard.pos.y, wp.z), 3);
    guard.lookAt(vec3(wp.x, guard.pos.y, wp.z));
    if (guard.distanceTo(vec3(wp.x, guard.pos.y, wp.z)) < 0.5)
      target = (target + 1) % WAYPOINTS.length;
    if (guard.distanceTo(player) < 6) guard.enterState("chase");
  });
  guard.onStateUpdate("chase", () => {
    guard.moveTo(player, 4.5);
    guard.lookAt(vec3(player.pos.x, guard.pos.y, player.pos.z));
    if (guard.distanceTo(player) > 10) guard.enterState("patrol");
  });
  guard.onStateEnter("rest", () => wait(2, () => guard.enterState("patrol")));

  let caught = 0;
  const hud = add([text("", { size: 18 }), pos(20, 16), fixed()]);
  add([
    text("WASD move · space jump · E / click kick crates · drag to look", { size: 14 }),
    pos(20, 510),
    fixed(),
  ]);
  const label = guard.add([text("!", { size: 30 }), pos(0, 1.5, 0)]); // floats over the guard
  onUpdate(() => {
    hud.text = `Caught ${caught} times · guard: ${guard.state}`;
    label.hidden = guard.state !== "chase";
    const dir = inputDir();
    player.move(dir.clone().multiplyScalar(6));
    if (dir.lengthSq() > 0) player.lookAt(player.worldPos().add(dir));
  });
  onButtonPress("jump", () => player.isGrounded() && player.jump(9));
  onButtonPress("kick", () => {
    for (const crate of get("crate")) {
      if (crate.distanceTo(player) < 2.2) {
        crate.applyImpulse(
          player
            .forward()
            .multiplyScalar(14)
            .add(vec3(0, 6, 0)),
        );
      }
    }
  });
  player.onCollide("guard", () => {
    if (guard.state !== "chase") return;
    caught++;
    camShake(0.4, 0.4);
    player.teleport(vec3(0, 1, 4));
    guard.enterState("rest");
  });
});

go("world");
