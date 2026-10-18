// Writing a plugin: new components and functions, installed with `plugins`.
// Click the spheres to celebrate.
import threeplay, { definePlugin } from "threeplay";

/**
 * A tiny plugin. `install` returns the API that gets merged into the engine
 * (and into `window` in global mode). It can use the engine itself (`k`).
 */
const partyPlugin = definePlugin({
  name: "party",
  dependencies: ["transform", "shapes", "gameplay"],
  install(k) {
    /** Component: floats up and down. */
    function bob(height = 0.3, speed = 2) {
      let base = null;
      return {
        id: "bob",
        require: ["pos"],
        update() {
          base ??= this.pos.y;
          this.pos.y = base + Math.sin(k.time() * speed) * height;
        },
      };
    }

    /** Spawns colorful particles that fly out and fade away. */
    function confetti(at, count = 40) {
      for (let i = 0; i < count; i++) {
        const vel = k.vec3(k.rand(-4, 4), k.rand(4, 9), k.rand(-4, 4));
        k.add([
          k.box(0.12, 0.12, 0.04),
          k.pos(at),
          k.rotate(k.rand(360), k.rand(360), 0),
          k.color(k.choose(["#ff006e", "#fb5607", "#ffbe0b", "#3a86ff", "#8338ec"])),
          k.opacity(1),
          k.lifespan(1.5, { fade: 0.7 }),
          {
            update() {
              vel.y -= 15 * k.dt();
              this.move(vel);
              this.rot.x += 400 * k.dt();
            },
          },
        ]);
      }
    }

    return { bob, confetti };
  },
});

threeplay({
  width: 960,
  height: 540,
  background: "#22223b",
  plugins: [partyPlugin],
  renderer: new URLSearchParams(location.search).get("renderer") ?? "auto",
});

scene("main", () => {
  add([plane(20, 20), color("#4a4e69")]);
  for (let i = 0; i < 5; i++) {
    add([sphere(0.6), pos(-6 + i * 3, 1.5, 0), color("#c9ada7"), bob(0.4, 1.5 + i * 0.3), "balloon"]);
  }
  camPos(0, 4, 10);
  camLookAt(vec3(0, 1.5, 0));
  add([text("Click a sphere", { size: 24 }), pos(480, 40), anchor("center"), fixed()]);
  onClick("balloon", (b) => {
    confetti(b.worldPos());
    beep({ freq: rand(500, 900), slideTo: 1400, duration: 0.15 });
  });
});

go("main");
