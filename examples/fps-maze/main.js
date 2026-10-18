// First-person maze shooter: find the exit, shoot what moves.
// Shows addLevel (ASCII maps), firstPerson(), raycast() and health().
import threeplay from "threeplay";

threeplay({
  width: 960,
  height: 540,
  background: "#1b1b2f",
  renderer: new URLSearchParams(location.search).get("renderer") ?? "auto",
});

const MAP = [
  "###########",
  "#@  #   e #",
  "# # # ### #",
  "# #   #   #",
  "# ##### # #",
  "#   e   # #",
  "### ### # #",
  "#e    #  x#",
  "###########",
];
const TILE = 2;

scene("game", () => {
  setFog({ color: "#1b1b2f", near: 3, far: 22 });
  let start = vec3();

  addLevel(MAP, {
    tileSize: TILE,
    tiles: {
      "#": (p) => [box(TILE, 3, TILE), pos(p.x, 1.5, p.z), color("#5c677d"), area(), body({ isStatic: true })],
      "@": (p) => {
        start = p.clone();
        return [];
      },
      e: (p) => [sphere(0.5), pos(p.x, 1, p.z), color("crimson"), area(), character(), health(3), "enemy"],
      x: (p) => [cylinder(0.7, 0.1), pos(p.x, 0.05, p.z), color("lime"), area(), "exit"],
    },
  });
  const size = MAP[0].length * TILE;
  add([box(size, 0.2, size), pos(0, -0.1, 0), color("#33415c"), area(), body({ isStatic: true })]);

  const player = add([capsule(0.4, 1.6), pos(start.x, 1, start.z), rotate(), area(), character(), health(5), "player"]);
  player.hidden = true;
  firstPerson(player, { height: 0.6 });

  const hud = add([text("", { size: 20 }), pos(20, 16), fixed()]);
  add([text("+", { size: 28 }), pos(480, 270), anchor("center"), fixed()]);
  const help = add([text("Click to look around · WASD to move · click to shoot", { size: 16 }), pos(480, 500), anchor("center"), fixed()]);
  const updateHud = () => {
    hud.text = `HP ${player.hp}   Enemies ${get("enemy").length}`;
  };
  updateHud();

  onUpdate(() => {
    player.move(inputDir().multiplyScalar(5));
    // Enemies chase the player when close; character() makes them slide along walls.
    for (const e of get("enemy")) {
      if (e.distanceTo(player) < 9) e.moveTo(player, 2);
    }
  });

  onMousePress("left", () => {
    if (!isPointerLocked()) return;
    help.hidden = true;
    const dir = camera3d.getWorldDirection(vec3());
    const hit = raycast(camPos(), dir, 50, { exclude: [player] });
    beep({ freq: 220, slideTo: 80, duration: 0.08, type: "sawtooth" });
    if (hit?.obj.is("enemy")) hit.obj.hurt(1);
  });

  on("hurt", "enemy", (e) => {
    e.color.set("white");
    wait(0.08, () => e.exists() && e.color.set("crimson"));
  });
  on("death", "enemy", (e) => {
    destroy(e);
    updateHud();
  });

  let invulnerable = false;
  player.onCollideUpdate("enemy", () => {
    if (invulnerable) return;
    invulnerable = true;
    player.hurt(1);
    camShake(0.2, 0.3);
    updateHud();
    wait(1, () => (invulnerable = false));
  });
  player.onDeath(() => go("end", false));
  player.onCollide("exit", () => go("end", true));
});

scene("end", (won) => {
  unlockPointer();
  add([text(won ? "You escaped!" : "You died", { size: 44 }), pos(480, 230), anchor("center"), fixed()]);
  add([text("Click to play again", { size: 20 }), pos(480, 290), anchor("center"), fixed()]);
  onClick(() => go("game"));
});

go("game");
