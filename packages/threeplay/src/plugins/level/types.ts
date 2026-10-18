import type * as THREE from "three";
import type { CompList, GameObj } from "../../core/types";

export interface LevelOpts {
  /** Size of a tile on X and Z (default 1). */
  tileSize?: number;
  /** World position of tile (0, 0)'s center (default: the map is centered on the origin). */
  origin?: THREE.Vector3 | { x: number; y: number; z: number };
  /**
   * What each character builds. The function gets the tile's world position
   * (center of the tile, y = origin.y) and grid coordinates; return the
   * components of the tile object. `pos()` is added for you if missing.
   * Characters with no entry (and spaces) are empty.
   */
  tiles: Record<string, (p: THREE.Vector3, col: number, row: number) => CompList>;
}

/**
 * Fields of the level object returned by `addLevel()`. Tiles are its
 * children, laid on the XZ plane: column → +X, row → +Z.
 */
export interface LevelComp {
  id: "level";
  readonly numCols: number;
  readonly numRows: number;
  readonly tileSize: number;
  /** Center of a tile in world space. */
  tileToWorld(col: number, row: number): THREE.Vector3;
  /** Tile under a world point (may be outside the map). */
  worldToTile(p: { x: number; z: number }): { col: number; row: number };
  /** Tile objects at a grid cell. */
  getAt(col: number, row: number): GameObj[];
  /** The map character at a grid cell (`" "` outside). */
  charAt(col: number, row: number): string;
  /** Adds a tile at a grid cell, from a map character or a component list. */
  spawn(what: string | CompList, col: number, row: number): GameObj | null;
}

/** API of the level plugin. */
export interface LevelAPI {
  /**
   * Builds a level from an ASCII map, one string per row:
   *
   * ```js
   * addLevel(["#####", "#@ o#", "#####"], {
   *   tiles: {
   *     "#": () => [box(1, 2, 1), color("gray"), area(), body({ isStatic: true })],
   *     "o": () => [sphere(0.3), color("gold"), area(), "coin"],
   *   },
   * });
   * ```
   */
  addLevel(map: string[], opts: LevelOpts): GameObj<LevelComp>;
}

declare module "../../core/types" {
  interface PluginRegistry {
    level: LevelAPI;
  }
}
