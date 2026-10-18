// Arcade racing: drive laps around the track against the clock.
// Shows a custom component (car), camFollow with rotateWithTarget and sensors.
import threeplay from "threeplay";

threeplay({
  width: 960,
  height: 540,
  background: "#a3cef1",
  renderer: new URLSearchParams(location.search).get("renderer") ?? "auto",
});

// Track: "#" walls, "F" finish line, "C" checkpoint, "S" start.
const MAP = [
  "####################",
  "#..................#",
  "#..................#",
  "#..##############..#",
  "#..#            #..#",
  "#CC#            #FF#",
  "#..#            #..#",
  "#..##############.S#",
  "#..................#",
  "#..................#",
  "####################",
];
const TILE = 4;

/** Arcade car handling: accelerate, brake and steer more the faster you go. */
function car({ maxSpeed = 28, accel = 18, turn = 110 } = {}) {
  return {
    id: "car",
    require: ["rotate", "character"],
    speed: 0,
    update() {
      const throttle = (isButtonDown("up") ? 1 : 0) - (isButtonDown("down") ? 1 : 0);
      if (throttle !== 0) this.speed += throttle * accel * dt();
      else this.speed *= 1 - 1.5 * dt(); // rolling friction
      this.speed = clamp(this.speed, -maxSpeed / 3, maxSpeed);
      const steer = (isButtonDown("left") ? 1 : 0) - (isButtonDown("right") ? 1 : 0);
      this.rot.y += steer * turn * dt() * clamp(this.speed / 10, -1, 1);
      this.move(this.forward().multiplyScalar(this.speed));
    },
    inspect() {
      return `${this.speed.toFixed(1)} m/s`;
    },
  };
}

scene("race", () => {
  let start = vec3();
  addLevel(MAP, {
    tileSize: TILE,
    tiles: {
      "#": (p) => [box(TILE, 1.5, TILE), pos(p.x, 0.75, p.z), color("#e63946"), area(), body({ isStatic: true })],
      F: (p) => [box(TILE, 0.05, 1), pos(p.x, 0.03, p.z), color("white"), area(), "finish"],
      C: (p) => [box(TILE, 2, 1), pos(p.x, 1, p.z), opacity(0), area(), "checkpoint"],
      S: (p) => {
        start = p.clone();
        return [];
      },
    },
  });
  const w = MAP[0].length * TILE;
  const h = MAP.length * TILE;
  add([box(w, 0.2, h), pos(0, -0.1, 0), color("#495057"), area(), body({ isStatic: true })]);
  add([box(w - 12 * TILE, 0.3, 2), pos(0, 0.05, 0), color("#2a9d8f")]); // infield decoration

  const player = add([
    box(1.6, 0.7, 3),
    pos(start.x, 0.6, start.z + 2),
    rotate(0),
    color("#ffbe0b"),
    area(),
    character({ stepHeight: 0.1 }),
    car(),
    "car",
  ]);
  // A cabin as a child object: it moves and turns with the car.
  player.add([box(1.2, 0.5, 1.3), pos(0, 0.55, 0.3), color("#023047")]);
  camFollow(player, { offset: vec3(0, 3.5, 8), rotateWithTarget: true, smooth: 0.15 });

  let lap = 0;
  let lapStart = time();
  let best = null;
  let checkpointPassed = false;
  const hud = add([text("", { size: 20 }), pos(20, 16), fixed()]);
  add([text("Arrows / WASD to drive", { size: 14 }), pos(20, 510), fixed()]);

  onUpdate(() => {
    const t = (time() - lapStart).toFixed(2);
    hud.text = `Lap ${lap}   Time ${t}s   Best ${best ? `${best.toFixed(2)}s` : "-"}   ${Math.abs(player.speed * 3.6).toFixed(0)} km/h`;
  });
  player.onCollide("checkpoint", () => (checkpointPassed = true));
  player.onCollide("finish", () => {
    if (!checkpointPassed) return;
    const lapTime = time() - lapStart;
    if (lap > 0) best = best === null ? lapTime : Math.min(best, lapTime);
    lap++;
    lapStart = time();
    checkpointPassed = false;
    beep({ freq: 880, duration: 0.15 });
  });
});

go("race");
