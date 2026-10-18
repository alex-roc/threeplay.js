import { Vector3 } from "three";
import { definePlugin } from "../../core/engine";
import type { Comp, CompList, Engine, GameObj } from "../../core/types";
import { cellKey, makeGrid, tileAt, tileCenter } from "./grid";
import type { LevelAPI, LevelComp, LevelObj, LevelOpts } from "./types";

export type * from "./types";

/** `true` if the component list already has a `pos()`. */
const hasPos = (list: CompList) =>
  list.some((c) => typeof c === "object" && c !== null && (c as Comp).id === "pos");

/** Built-in plugin: `addLevel()`, ASCII-map levels on the XZ plane. */
export const levelPlugin = definePlugin<LevelAPI>({
  name: "level",
  dependencies: ["transform"],
  install(k: Engine) {
    function addLevel(map: string[], opts: LevelOpts): LevelObj {
      if (!Array.isArray(map)) {
        throw new Error('addLevel() needs a map: an array of strings, e.g. ["###", "#@#"].');
      }
      if (!opts?.tiles) {
        throw new Error("addLevel() needs `tiles`: what each map character builds.");
      }
      const grid = makeGrid(map, opts.tileSize ?? 1, opts.origin);
      // Tile objects by grid cell. Entries leave the index when the tile is destroyed.
      const index = new Map<string, GameObj[]>();

      const comp: LevelComp = {
        id: "level",
        numCols: grid.numCols,
        numRows: grid.numRows,
        tileSize: grid.tileSize,
        tileToWorld(col, row) {
          const local = tileCenter(grid, col, row);
          level.object3d.updateWorldMatrix(true, false);
          return level.object3d.localToWorld(new Vector3(local.x, local.y, local.z));
        },
        worldToTile(p) {
          level.object3d.updateWorldMatrix(true, false);
          const local = level.object3d.worldToLocal(new Vector3(p.x, grid.origin.y, p.z));
          return tileAt(grid, local.x, local.z);
        },
        getAt(col, row) {
          return (index.get(cellKey(col, row)) ?? []).slice();
        },
        charAt(col, row) {
          return map[row]?.[col] ?? " ";
        },
        spawn(what, col, row) {
          let list: CompList | undefined;
          if (typeof what === "string") {
            list = opts.tiles[what]?.(comp.tileToWorld(col, row), col, row);
          } else {
            list = what;
          }
          if (!list) return null;
          // Builders get world coordinates; the tile's pos is local to the level.
          const local = tileCenter(grid, col, row);
          const tile = level.add(hasPos(list) ? list : [k.pos(local.x, local.y, local.z), ...list]);
          const key = cellKey(col, row);
          const cell = index.get(key);
          if (cell) cell.push(tile);
          else index.set(key, [tile]);
          tile.onDestroy(() => {
            const rest = index.get(key)?.filter((t) => t !== tile) ?? [];
            if (rest.length > 0) index.set(key, rest);
            else index.delete(key);
          });
          return tile;
        },
      };

      const level = k.add([k.pos(0, 0, 0), comp, "level"]) as LevelObj;
      for (let row = 0; row < grid.numRows; row++) {
        for (let col = 0; col < grid.numCols; col++) {
          const ch = map[row][col];
          if (ch === undefined || ch === " ") continue;
          level.spawn(ch, col, row);
        }
      }
      return level;
    }

    return { addLevel };
  },
});
