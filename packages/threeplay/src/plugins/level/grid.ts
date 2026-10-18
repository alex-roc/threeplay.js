/** Grid geometry of a level, free of any three.js object so it is easy to test. */
export interface Grid {
  readonly numCols: number;
  readonly numRows: number;
  readonly tileSize: number;
  /** Local position of tile (0, 0)'s center. */
  readonly origin: { x: number; y: number; z: number };
}

/**
 * Builds the grid of a map. Without `origin` the map is centered on `(0, 0, 0)`:
 * tile (0, 0) sits at `(-(numCols - 1) / 2 * tileSize, 0, -(numRows - 1) / 2 * tileSize)`.
 */
export function makeGrid(
  map: readonly string[],
  tileSize: number,
  origin?: { x: number; y: number; z: number },
): Grid {
  const numRows = map.length;
  const numCols = map.reduce((max, row) => Math.max(max, row.length), 0);
  return {
    numCols,
    numRows,
    tileSize,
    origin: origin
      ? { x: origin.x, y: origin.y, z: origin.z }
      : { x: (-(numCols - 1) / 2) * tileSize, y: 0, z: (-(numRows - 1) / 2) * tileSize },
  };
}

/** Local center of a tile: column → +X, row → +Z. */
export function tileCenter(grid: Grid, col: number, row: number) {
  return {
    x: grid.origin.x + col * grid.tileSize,
    y: grid.origin.y,
    z: grid.origin.z + row * grid.tileSize,
  };
}

/** Tile containing a local point (a tile spans half a tile size around its center). */
export function tileAt(grid: Grid, x: number, z: number) {
  return {
    col: Math.floor((x - grid.origin.x) / grid.tileSize + 0.5),
    row: Math.floor((z - grid.origin.z) / grid.tileSize + 0.5),
  };
}

/** Key of a grid cell in the object index. */
export const cellKey = (col: number, row: number) => `${col},${row}`;
