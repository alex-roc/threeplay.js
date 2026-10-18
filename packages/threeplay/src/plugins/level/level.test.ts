import { describe, expect, it } from "vitest";
import { createEngine } from "../../core/engine.js";
import type { Engine } from "../../core/types.js";
import { renderPlugin } from "../render/index.js";
import { transformPlugin } from "../transform/index.js";
import { makeGrid, tileAt, tileCenter } from "./grid.js";
import { levelPlugin } from "./index.js";

const make = () =>
  createEngine({ loop: "manual", renderer: "none" }, [
    renderPlugin,
    transformPlugin,
    levelPlugin,
  ]) as Engine;

const MAP = ["#####", "#@ o#", "#####"];

describe("grid math", () => {
  it("centers the map on the origin by default", () => {
    const g = makeGrid(MAP, 2);
    expect(g.numCols).toBe(5);
    expect(g.numRows).toBe(3);
    expect(tileCenter(g, 0, 0)).toEqual({ x: -4, y: 0, z: -2 });
    expect(tileCenter(g, 4, 2)).toEqual({ x: 4, y: 0, z: 2 });
    expect(tileCenter(g, 2, 1)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("honors an explicit origin and round-trips points to tiles", () => {
    const g = makeGrid(MAP, 2, { x: 10, y: 1, z: 20 });
    expect(tileCenter(g, 1, 2)).toEqual({ x: 12, y: 1, z: 24 });
    expect(tileAt(g, 12.9, 24.9)).toEqual({ col: 1, row: 2 });
    expect(tileAt(g, 11.1, 23.1)).toEqual({ col: 1, row: 2 });
    expect(tileAt(g, 8.9, 18.9)).toEqual({ col: -1, row: -1 });
  });

  it("uses the longest row for numCols", () => {
    expect(makeGrid(["a", "abc", "ab"], 1).numCols).toBe(3);
  });
});

describe("addLevel", () => {
  it("builds tiles as children laid on XZ with world-position builders", () => {
    const k = make();
    const seen: Array<[number, number, number, number]> = [];
    const level = k.addLevel(MAP, {
      tileSize: 2,
      tiles: {
        "#": () => ["wall"],
        o: (p, col, row) => {
          seen.push([p.x, p.z, col, row]);
          return ["coin"];
        },
      },
    });
    expect(level.is("level")).toBe(true);
    expect(level.has("pos")).toBe(true);
    expect(level.children.length).toBe(12 + 1); // 12 walls + 1 coin, "@" and " " are empty
    expect(seen).toEqual([[2, 0, 3, 1]]);
    const coin = level.get("coin")[0];
    expect(coin.parent).toBe(level);
    expect(coin.worldPos().toArray()).toEqual([2, 0, 0]);
    expect(level.get("wall")[0].worldPos().toArray()).toEqual([-4, 0, -2]);
  });

  it("does not add pos when the builder already did", () => {
    const k = make();
    const level = k.addLevel(["a"], {
      tiles: { a: (p) => [k.pos(p.x, 5, p.z), "x"] },
    });
    expect(level.get("x")[0].pos.y).toBe(5);
  });

  it("tileToWorld / worldToTile / charAt / getAt", () => {
    const k = make();
    const level = k.addLevel(MAP, { tiles: { "#": () => ["wall"], o: () => ["coin"] } });
    expect(level.tileToWorld(3, 1).toArray()).toEqual([1, 0, 0]);
    expect(level.worldToTile({ x: 1.2, z: 0.4 })).toEqual({ col: 3, row: 1 });
    expect(level.worldToTile({ x: -100, z: 0 }).col).toBeLessThan(0);
    expect(level.charAt(1, 1)).toBe("@");
    expect(level.charAt(2, 1)).toBe(" ");
    expect(level.charAt(99, 99)).toBe(" ");
    expect(level.getAt(3, 1).map((o) => o.is("coin"))).toEqual([true]);
    expect(level.getAt(1, 1)).toEqual([]);
  });

  it("follows the level object when it moves", () => {
    const k = make();
    const level = k.addLevel(["o"], { tiles: { o: () => ["coin"] } });
    level.pos = k.vec3(10, 0, 0);
    expect(level.tileToWorld(0, 0).x).toBe(10);
    expect(level.worldToTile({ x: 10, z: 0 })).toEqual({ col: 0, row: 0 });
    expect(level.get("coin")[0].worldPos().x).toBe(10);
  });

  it("spawn adds tiles from a char or a component list and indexes them", () => {
    const k = make();
    const level = k.addLevel(["  ", "  "], { tiles: { o: () => ["coin"] } });
    const coin = level.spawn("o", 1, 1)!;
    expect(coin.is("coin")).toBe(true);
    expect(level.getAt(1, 1)).toEqual([coin]);
    const extra = level.spawn(["spike"], 1, 1)!;
    expect(level.getAt(1, 1).length).toBe(2);
    expect(level.spawn("?", 0, 0)).toBeNull();
    expect(extra.worldPos().toArray()).toEqual([0.5, 0, 0.5]);
  });

  it("drops destroyed tiles from the index", () => {
    const k = make();
    const level = k.addLevel(["oo"], { tiles: { o: () => ["coin"] } });
    const [a, b] = level.get("coin");
    expect(level.getAt(0, 0)).toEqual([a]);
    a.destroy();
    expect(level.getAt(0, 0)).toEqual([]);
    expect(level.getAt(1, 0)).toEqual([b]);
  });

  it("destroying the level destroys its tiles", () => {
    const k = make();
    const level = k.addLevel(["o"], { tiles: { o: () => ["coin"] } });
    level.destroy();
    expect(k.get("coin").length).toBe(0);
  });

  it("validates its arguments", () => {
    const k = make();
    expect(() => k.addLevel("###" as unknown as string[], { tiles: {} })).toThrow(
      /array of strings/,
    );
    expect(() => k.addLevel(["#"], {} as never)).toThrow(/tiles/);
  });
});
