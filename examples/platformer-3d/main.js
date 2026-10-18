// 3D platformer / collectathon: run, jump between platforms, collect every coin.
import threeplay from "threeplay";

threeplay({
  width: 960,
  height: 540,
  background: "#8ecae6",
  renderer: new URLSearchParams(location.search).get("renderer") ?? "auto",
});

// A custom component is just an object: fields and methods merge into the
// game object, and update() runs every frame with `this` bound to it.
function spin(speed = 120) {
  return {
    id: "spin",
    require: ["rotate"],
    update() {
      this.rot.y += speed * dt();
    },
  };
}

// [x, y, z, width, height, depth]
const PLATFORMS = [
  [0, -0.5, 0, 14, 1, 14],
  [5, 1, -5, 3, 0.5, 3],
  [9, 2.5, -1, 3, 0.5, 3],
  [5, 4, 4, 3, 0.5, 3],
  [-2, 5.5, 7, 4, 0.5, 2],
  [-8, 4, 2, 3, 0.5, 3],
  [-7, 2, -6, 4, 0.5, 4],
];

scene("game", () => {
  setGravity(30);

  for (const [x, y, z, w, h, d] of PLATFORMS) {
    add([box(w, h, d), pos(x, y, z), color("#6a994e"), area(), body({ isStatic: true })]);
  }
  // One coin floating over each raised platform.
  for (const [x, y, z, , h] of PLATFORMS.slice(1)) {
    add([sphere(0.3), pos(x, y + h / 2 + 0.8, z), rotate(), spin(), color("gold"), area(), "coin"]);
  }

  const player = add([
    capsule(0.4, 1.6),
    pos(0, 1.5, 0),
    rotate(),
    color("#fb8500"),
    area(),
    character(),
    "player",
  ]);
  thirdPerson(player, { distance: 8, height: 1.2 });

  const total = get("coin").length;
  let score = 0;
  const hud = add([text(`Coins: 0 / ${total}`, { size: 22 }), pos(20, 16), fixed()]);
  add([text("WASD / arrows to move · space to jump · drag to look", { size: 14 }), pos(20, 510), fixed()]);

  onUpdate(() => {
    const dir = inputDir(); // camera-relative, on the XZ plane
    player.move(dir.clone().multiplyScalar(6));
    if (dir.lengthSq() > 0) player.lookAt(player.worldPos().add(dir));
    if (player.pos.y < -15) player.teleport(vec3(0, 2, 0));
  });
  onButtonPress("jump", () => {
    if (player.isGrounded()) player.jump(11);
  });

  player.onCollide("coin", (coin) => {
    destroy(coin);
    score++;
    beep({ freq: 660 + score * 60, slideTo: 1200 });
    hud.text = `Coins: ${score} / ${total}`;
    if (score === total) go("win");
  });
});

scene("win", () => {
  add([text("All coins collected!", { size: 40 }), pos(480, 230), anchor("center"), fixed()]);
  add([text("Press space to play again", { size: 20 }), pos(480, 290), anchor("center"), fixed()]);
  onButtonPress("jump", () => go("game"));
});

go("game");
