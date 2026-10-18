// Physics sandbox: knock over a tower, spawn shapes, flick things around.
// Shows dynamic bodies, impulses, onClick on 3D objects and orbitCamera.
import threeplay from "threeplay";

threeplay({
  width: 960,
  height: 540,
  background: "#f1faee",
});

const PALETTE = ["#e63946", "#457b9d", "#f4a261", "#2a9d8f", "#8338ec"];

function spawnShape(at) {
  const shape = choose([box(1, 1, 1), sphere(0.55), cylinder(0.5, 1), capsule(0.4, 1.4)]);
  add([
    shape,
    pos(at),
    rotate(rand(360), rand(360), 0),
    color(choose(PALETTE)),
    area({ restitution: 0.3 }),
    body(),
    lifespan(30, { fade: 1 }),
    opacity(1),
    "prop",
  ]);
}

scene("sandbox", () => {
  setGravity(9.81);
  add([box(30, 1, 30), pos(0, -0.5, 0), color("#a8dadc"), area(), body({ isStatic: true })]);

  // A tower of crates.
  for (let y = 0; y < 6; y++) {
    for (let x = -1; x <= 1; x++) {
      add([
        box(1, 1, 1),
        pos(x * 1.05, 0.5 + y * 1.02, 0),
        color(PALETTE[(x + y + 3) % 5]),
        area(),
        body({ mass: 1 }),
        "prop",
      ]);
    }
  }
  const ball = add([
    sphere(0.7),
    pos(0, 0.7, 8),
    color("#1d3557"),
    area({ restitution: 0.5 }),
    body({ mass: 6 }),
    "prop",
    "ball",
  ]);

  orbitCamera({ target: vec3(0, 2, 0), distance: 16 });
  add([
    text("Click a shape to flick it · space: spawn · B: bowl the ball · R: reset · drag to orbit", {
      size: 15,
    }),
    pos(20, 16),
    fixed(),
  ]);
  const counter = add([text("", { size: 15 }), pos(20, 40), fixed()]);
  onUpdate(() => {
    counter.text = `${get("prop").length} bodies`;
  });

  onClick("prop", (obj) => {
    const push = camForward().multiplyScalar(6 * (obj.is("ball") ? 6 : 1));
    obj.applyImpulse(push.add(vec3(0, 3, 0)));
  });
  onKeyPress("space", () => spawnShape(vec3(rand(-3, 3), 10, rand(-3, 3))));
  onKeyPress("b", () => {
    ball.teleport(vec3(0, 0.7, 8));
    ball.applyImpulse(vec3(0, 0, -150));
  });
  onKeyPress("r", () => go("sandbox"));
});

go("sandbox");
