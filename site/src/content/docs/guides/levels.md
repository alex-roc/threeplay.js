---
title: Levels from ASCII maps
description: Build levels from text maps with addLevel, tile builders, tile size and origin, and the grid helpers to query and change a level at runtime.
sidebar:
  order: 9
---

`addLevel()` builds a level from an array of strings: each character is a tile, and you say what each character turns into. Levels are laid out on the **XZ plane**: columns go along +X, rows go along +Z, and Y is up (so the first row of the map is the far side of the world, at the top of the screen with the default camera).

Here is a complete maze: walls, coins to collect, a start point and an exit.

```js
import threeplay from "threeplay";

threeplay({ width: 960, height: 540, background: "#1b1b2f" });

const MAP = [
  "###########",
  "#@  #   o #",
  "# # # ### #",
  "# #   #   #",
  "# ##### # #",
  "#   o   # #",
  "### ### # #",
  "#o    #  x#",
  "###########",
];
const TILE = 3; // meters per tile

scene("maze", () => {
  let start = vec3();

  const level = addLevel(MAP, {
    tileSize: TILE,
    tiles: {
      // p is the world position of the center of the tile (y = 0)
      "#": (p) => [
        box(TILE, 3, TILE),
        pos(p.x, 1.5, p.z), // our own pos: lift the box so it stands on the floor
        color("#5c677d"),
        area(),
        body({ isStatic: true }),
      ],
      "@": (p) => {
        start = p.clone(); // a marker: no components
        return [];
      },
      o: (p) => [sphere(0.4), pos(p.x, 1, p.z), color("gold"), area(), "coin"],
      x: (p) => [cylinder(1, 0.1), pos(p.x, 0.05, p.z), color("lime"), area(), "exit"],
    },
  });

  // The floor is not part of the map: one big box is cheaper than one per tile.
  const size = level.numCols * TILE;
  add([box(size, 0.2, level.numRows * TILE), pos(0, -0.1, 0), color("#33415c"), area(), body({ isStatic: true })]);

  const player = add([capsule(0.4, 1.6), pos(start.x, 1, start.z), color("#f77f00"), area(), character(), "player"]);
  topDown(player, { height: 26, angle: 15 });

  const hud = add([text("", { size: 20 }), pos(20, 16), fixed()]);
  let coins = 0;
  onUpdate(() => {
    player.move(inputDir().multiplyScalar(6));
    const { col, row } = level.worldToTile(player.worldPos());
    hud.text = `Coins: ${coins}   Tile: ${col}, ${row} ("${level.charAt(col, row)}")`;
  });

  player.onCollide("coin", (coin) => {
    coin.destroy();
    coins++;
    beep({ freq: 660, duration: 0.08 });
  });
  player.onCollide("exit", () => go("win", coins));
});

scene("win", (coins) => {
  add([text(`You escaped with ${coins} coins!`, { size: 36 }), pos(480, 270), anchor("center"), fixed()]);
  onButtonPress("jump", () => go("maze"));
});

go("maze");
```

## The map

A map is an array of strings, one per row. Rows can have different lengths (missing columns count as empty). A **space** is always an empty tile, and so is any character that has no entry in `tiles`.

```js
const map = [
  "#####",
  "#@ o#",
  "#####",
];
```

Tile `(col, row)` has its center at:

```
x = origin.x + col * tileSize
z = origin.z + row * tileSize
```

By default the map is **centered on the world origin**, so the middle of the map is (0, 0, 0). Pass `origin` (a vector or `{ x, y, z }`) to say where the center of tile (0, 0) goes instead; with `origin: vec3(0, 0, 0)` the top-left corner tile is at the origin and the map extends towards +X and +Z.

## Tile builders

`tiles` maps a character to a function that returns the **components** of the tile:

```js
addLevel(map, {
  tileSize: 2,    // meters per tile on X and Z (default 1)
  origin: vec3(0, 0, 0),
  tiles: {
    "#": (p, col, row) => [box(2, 2, 2), pos(p.x, 1, p.z), color("gray"), area(), body({ isStatic: true })],
    o: (p) => [sphere(0.3), color("gold"), area(), "coin"],
  },
});
```

The builder receives `p`, the **world position of the center of the tile** (with `y` equal to `origin.y`, 0 by default) and the grid coordinates `col` and `row`. It returns a component list exactly like `add([...])`, tags included.

- If the list has no `pos()`, one is added for you at the tile's center. That is why the coins above need no `pos`.
- If it has one, yours is used, which lets you choose the height of each tile (`pos(p.x, 1.5, p.z)`). Tiles are children of the level object, so your `pos` is **local to the level**. The level object sits at the world origin, so local and world coordinates are the same unless you move the level afterwards (its tiles then move with it).
- A builder that returns `[]` still creates an (empty) object at the tile. Use it for markers like a start point, and use `p` to remember where it is. Builders may have side effects too: counting enemies, remembering the start, spawning other objects.

## The level object

`addLevel()` returns the level: a game object tagged `"level"`, with `pos(0, 0, 0)`, whose children are the tiles. Besides the usual object API it has:

| Field | Meaning |
| --- | --- |
| `numCols`, `numRows` | Size of the map in tiles (`numCols` is the longest row). |
| `tileSize` | Meters per tile. |
| `tileToWorld(col, row)` | The world position of the center of a tile (a new vector). |
| `worldToTile({ x, z })` | `{ col, row }` of the tile under a world point. It can be outside the map. |
| `getAt(col, row)` | The objects spawned at a cell (an array). Destroyed ones drop out. |
| `charAt(col, row)` | The map character at a cell (`" "` outside the map). |
| `spawn(what, col, row)` | Adds a tile at a cell, from a map character or a component list. Returns the tile, or `null` if the character has no builder. |

`tileToWorld` and `worldToTile` go through the level object's transform, so they stay correct if you move or rotate the level.

## Changing a level at runtime

```js
// Open a passage: destroy whatever was built at a cell
for (const wall of level.getAt(4, 1)) wall.destroy();

// Drop a coin from a map character...
level.spawn("o", 5, 1);

// ...or from components
level.spawn([sphere(0.4), color("red"), area(), "enemy"], 2, 3);

// Where is the start tile?
const startWorld = level.tileToWorld(1, 1);
player.setWorldPos(startWorld);
```

`getAt` finds tiles by the cell they were **spawned** in. If a tile moves afterwards (a pushed crate, a patrolling enemy), it stays in its original cell in that index. For moving things use tags and `get()`, and `worldToTile(obj.worldPos())` to ask where they are now.

## Tips

- A map is just data. Keep several in an array and pick one in the scene: `scene("level", (n) => addLevel(LEVELS[n], opts))`, then `go("level", 2)`. A level and everything on it is destroyed by `go()`.
- Maps can come from text files: `load(fetch("level1.txt").then((r) => r.text()).then((t) => (map = t.split("\n"))))`.
- Each tile is a separate object (and mesh). That is fine for hundreds of tiles; for huge levels, make the floor one big box (as above), and merge rows of walls into longer boxes in your builder.
- Use different tags in tile builders (`"wall"`, `"coin"`, `"enemy"`) and write the game logic against the tags, so the map stays a pure layout.
