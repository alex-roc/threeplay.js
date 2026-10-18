# level

ASCII-map levels on the XZ plane. Depends on `transform`.

`addLevel(map, opts)` returns a parent object (`pos(0, 0, 0)` + level component + tag
`"level"`); every tile is a child of it. Columns go to +X, rows to +Z, and the map is
centered on the origin unless you pass `origin` (the center of tile `(0, 0)`).

## API

- `addLevel(map: string[], { tileSize = 1, origin, tiles })` — `tiles[char](p, col, row)`
  returns the tile's component list; `p` is the tile center in world space. `pos(p)` is added
  for you unless the list already has a `pos`. Spaces and characters without an entry are empty.
- On the returned object: `numCols`, `numRows`, `tileSize`, `tileToWorld(col, row)`,
  `worldToTile({ x, z })` (may fall outside the map), `getAt(col, row)`, `charAt(col, row)`,
  `spawn(charOrComps, col, row)` (returns `null` when the char builds nothing).
- `tileToWorld`/`worldToTile` go through the level object's transform, so they stay right if
  you move it. `getAt` indexes tiles by the cell they were spawned in and forgets destroyed ones.
- The grid math lives in `grid.ts` (pure functions, unit-tested).

## Example

```js
const level = addLevel(["#####", "#@ o#", "#####"], {
  tileSize: 2,
  tiles: {
    "#": () => [box(2, 2, 2), color("gray"), area(), body({ isStatic: true })],
    o: () => [sphere(0.4), color("gold"), area(), "coin"],
  },
});

const start = level.tileToWorld(1, 1); // where "@" is
player.setWorldPos(start);
level.spawn("o", 2, 1); // drop a coin at runtime
```
