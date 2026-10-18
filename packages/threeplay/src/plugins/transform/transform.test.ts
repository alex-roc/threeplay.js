import { describe, expect, it } from "vitest";
import { createEngine } from "../../core/engine";
import type { Engine } from "../../core/types";
import { transformPlugin } from ".";

const make = () => createEngine({ loop: "manual" }, [transformPlugin]) as Engine;

describe("transform", () => {
  it("pos is the object3d position", () => {
    const k = make();
    const o = k.add([k.pos(1, 2, 3)]);
    expect(o.pos).toBe(o.object3d.position);
    expect(o.pos.toArray()).toEqual([1, 2, 3]);
    o.pos = k.vec3(4, 5, 6);
    expect(o.object3d.position.x).toBe(4);
  });

  it("move() scales by dt and defers to applyMove", () => {
    const k = make();
    const o = k.add([k.pos()]);
    k.onUpdate(() => o.move(10, 0, 0));
    k.step(0.1);
    expect(o.pos.x).toBeCloseTo(1);
    const moves: number[] = [];
    const p = k.add([k.pos(), { applyMove: (d: { x: number }) => moves.push(d.x) }]);
    k.onUpdate(() => p.move(10, 0, 0));
    k.step(0.1);
    expect(p.pos.x).toBe(0);
    expect(moves[0]).toBeCloseTo(1);
  });

  it("world positions account for parents", () => {
    const k = make();
    const parent = k.add([k.pos(10, 0, 0)]);
    const child = parent.add([k.pos(1, 0, 0)]);
    expect(child.worldPos().x).toBe(11);
    child.setWorldPos(k.vec3(0, 0, 0));
    expect(child.pos.x).toBe(-10);
    expect(child.distanceTo(parent)).toBeCloseTo(10);
  });

  it("rotate keeps rot (degrees) and the node in sync both ways", () => {
    const k = make();
    const o = k.add([k.pos(), k.rotate(90)]);
    expect(o.rot.y).toBe(90);
    expect(o.object3d.rotation.y).toBeCloseTo(Math.PI / 2);
    o.rot.y = 180;
    k.step(0.016);
    expect(o.object3d.rotation.y).toBeCloseTo(Math.PI);
    o.object3d.rotation.y = 0; // e.g. physics wrote it
    k.step(0.016);
    expect(o.rot.y).toBeCloseTo(0);
  });

  it("forward is -Z and lookAt points it at the target", () => {
    const k = make();
    const o = k.add([k.pos(), k.rotate()]);
    expect(o.forward().z).toBeCloseTo(-1);
    o.lookAt(k.vec3(5, 0, 0));
    const f = o.forward();
    expect(f.x).toBeCloseTo(1);
    expect(f.z).toBeCloseTo(0);
    expect(o.right().z).toBeCloseTo(1);
  });

  it("scale and follow", () => {
    const k = make();
    const o = k.add([k.scale(2)]);
    expect(o.scale.toArray()).toEqual([2, 2, 2]);
    const target = k.add([k.pos(3, 0, 0)]);
    const f = k.add([k.pos(), k.follow(target, k.vec3(0, 1, 0))]);
    k.step(0.016);
    expect(f.pos.toArray()).toEqual([3, 1, 0]);
  });
});
