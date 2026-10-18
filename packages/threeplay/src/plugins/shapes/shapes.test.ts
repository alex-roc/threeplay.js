import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Texture,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../core/engine";
import type { Engine, PluginLike } from "../../core/types";
import { assetsPlugin } from "../assets";
import { renderPlugin } from "../render";
import { transformPlugin } from "../transform";
import { shapesPlugin } from ".";
import { makeGeometry } from "./geometry";
import { applyOpacity, createMaterial, repeatOf } from "./materials";

const make = (extra: PluginLike[] = []) =>
  createEngine({ loop: "manual", renderer: "none" }, [
    renderPlugin,
    transformPlugin,
    shapesPlugin,
    ...extra,
  ]) as Engine;

const bbox = (g: ReturnType<typeof makeGeometry>) => {
  g.computeBoundingBox();
  return g.boundingBox!.getSize(new Vector3());
};

describe("geometry", () => {
  it("builds each primitive with the sizes of its description", () => {
    expect(bbox(makeGeometry({ kind: "box", width: 1, height: 2, depth: 3 })).toArray()).toEqual([
      1, 2, 3,
    ]);
    expect(bbox(makeGeometry({ kind: "sphere", radius: 2 })).x).toBeCloseTo(4);
    expect(bbox(makeGeometry({ kind: "cylinder", radius: 1, height: 5 })).y).toBeCloseTo(5);
    expect(bbox(makeGeometry({ kind: "cone", radius: 1, height: 3 })).y).toBeCloseTo(3);
  });

  it("capsule height is the total height", () => {
    const size = bbox(makeGeometry({ kind: "capsule", radius: 0.5, height: 2 }));
    expect(size.y).toBeCloseTo(2);
    expect(size.x).toBeCloseTo(1);
    // Shorter than two caps: degenerates to a sphere instead of failing.
    expect(bbox(makeGeometry({ kind: "capsule", radius: 1, height: 1 })).y).toBeCloseTo(2);
  });

  it("plane is a floor on XZ facing up", () => {
    const g = makeGeometry({ kind: "plane", width: 4, depth: 6 });
    const size = bbox(g);
    expect(size.toArray().map((n) => Math.round(n * 1000) / 1000)).toEqual([4, 0, 6]);
    const n = g.getAttribute("normal");
    expect(n.getY(0)).toBeCloseTo(1);
  });

  it("mesh and model have no geometry of their own", () => {
    expect(() => makeGeometry({ kind: "mesh" })).toThrow(/mesh\(\)/);
  });
});

describe("primitives", () => {
  it("adds a mesh child of object3d and exposes shape and mesh", () => {
    const k = make();
    const o = k.add([k.pos(1, 0, 0), k.box(2, 3, 4)]);
    expect(o.shape).toEqual({ kind: "box", width: 2, height: 3, depth: 4 });
    expect(o.mesh).toBeInstanceOf(Mesh);
    expect(o.mesh.parent).toBe(o.object3d);
    expect(o.mesh.castShadow).toBe(true);
    expect(o.mesh.receiveShadow).toBe(true);
    const mat = o.mesh.material as MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xdddddd);
    expect(mat.roughness).toBe(0.8);
  });

  it("box(n) is a cube; defaults exist for every shape", () => {
    const k = make();
    expect(k.add([k.box(2)]).shape).toEqual({ kind: "box", width: 2, height: 2, depth: 2 });
    for (const comp of [k.box(), k.sphere(), k.capsule(), k.cylinder(), k.cone(), k.plane()]) {
      expect(k.add([comp]).mesh).toBeInstanceOf(Mesh);
    }
  });

  it("honors shadow options", () => {
    const k = make();
    const o = k.add([k.sphere(1, { castShadow: false, receiveShadow: false })]);
    expect(o.mesh.castShadow).toBe(false);
    expect(o.mesh.receiveShadow).toBe(false);
  });

  it("scale applies to the mesh through object3d", () => {
    const k = make();
    const o = k.add([k.scale(2), k.box()]);
    const world = new Vector3();
    o.mesh.updateWorldMatrix(true, false);
    o.mesh.getWorldScale(world);
    expect(world.x).toBe(2);
  });

  it("disposes its geometry and material on destroy, but not what the user brought", () => {
    const k = make();
    const o = k.add([k.box()]);
    const geoSpy = vi.spyOn(o.mesh.geometry, "dispose");
    const matSpy = vi.spyOn(o.mesh.material as MeshStandardMaterial, "dispose");
    o.destroy();
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
    expect(o.mesh.parent).toBeNull();

    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const userGeo = vi.spyOn(geometry, "dispose");
    const userMat = vi.spyOn(material, "dispose");
    const m = k.add([k.mesh(geometry, material)]);
    expect(m.shape).toEqual({ kind: "mesh" });
    expect(m.mesh.material).toBe(material);
    m.destroy();
    expect(userGeo).not.toHaveBeenCalled();
    expect(userMat).not.toHaveBeenCalled();
  });

  it("mesh() without a material gets (and owns) the default one", () => {
    const k = make();
    const m = k.add([k.mesh(new BoxGeometry())]);
    const spy = vi.spyOn(m.mesh.material as MeshStandardMaterial, "dispose");
    m.destroy();
    expect(spy).toHaveBeenCalled();
  });
});

describe("color", () => {
  it("shares one Color instance with the material, whatever the order", () => {
    const k = make();
    const a = k.add([k.box(), k.color("#ff0000")]);
    const b = k.add([k.color("#00ff00"), k.box()]);
    for (const [o, hex] of [
      [a, "ff0000"],
      [b, "00ff00"],
    ] as const) {
      expect(o.color).toBeInstanceOf(Color);
      expect((o.mesh.material as MeshStandardMaterial).color).toBe(o.color);
      expect(o.color.getHexString()).toBe(hex);
    }
    a.color.set("#0000ff");
    expect((a.mesh.material as MeshStandardMaterial).color.getHexString()).toBe("0000ff");
  });

  it("the setter copies into the same instance", () => {
    const k = make();
    const o = k.add([k.box(), k.color("red")]);
    const before = o.color;
    (o as { color: unknown }).color = "#123456"; // the setter takes any ColorLike
    expect(o.color).toBe(before);
    expect(o.color.getHexString()).toBe("123456");
    expect((o.mesh.material as MeshStandardMaterial).color).toBe(before);
  });

  it("accepts every form", () => {
    const k = make();
    expect(k.add([k.color("#f00")]).color.getHexString()).toBe("ff0000");
    expect(k.add([k.color("tomato")]).color.getHexString()).toBe("ff6347");
    expect(k.add([k.color(255, 0, 0)]).color.getHexString()).toBe("ff0000");
    expect(k.add([k.color([0, 255, 0])]).color.getHexString()).toBe("00ff00");
    expect(k.add([k.color(0x0000ff)]).color.getHexString()).toBe("0000ff");
    expect(k.add([k.color()]).color.getHexString()).toBe("ffffff");
  });

  it("works without a mesh (HUD objects keep obj.color)", () => {
    const k = make();
    const o = k.add([k.color("red")]);
    expect(o.color.getHexString()).toBe("ff0000");
  });

  it("can be added to a live object", () => {
    const k = make();
    const o = k.add([k.box()]);
    o.use(k.color("#00ffff"));
    const color = (o as unknown as { color: Color }).color;
    expect((o.mesh.material as MeshStandardMaterial).color).toBe(color);
    expect(color.getHexString()).toBe("00ffff");
  });
});

describe("opacity", () => {
  it("syncs to the material every frame and turns transparent below 1", () => {
    const k = make();
    const o = k.add([k.box(), k.opacity(1)]);
    const mat = o.mesh.material as MeshStandardMaterial;
    expect(mat.transparent).toBe(false);
    o.opacity = 0.4;
    k.step(0.016);
    expect(mat.opacity).toBeCloseTo(0.4);
    expect(mat.transparent).toBe(true);
    o.opacity = 1;
    k.step(0.016);
    expect(mat.transparent).toBe(false);
  });

  it("opacity 1 doesn't clear a transparent flag the material came with", () => {
    const m = new MeshBasicMaterial({ transparent: true });
    applyOpacity(m, 0.5);
    applyOpacity(m, 1);
    expect(m.transparent).toBe(true);
  });

  it("fadeOut tweens to 0 and can destroy the object", async () => {
    const k = make();
    const o = k.add([k.box(), k.opacity()]);
    o.fadeOut(1, true);
    for (let i = 0; i < 5; i++) k.step(0.1); // dt is clamped to 0.1
    expect(o.opacity).toBeCloseTo(0.5);
    expect(o.exists()).toBe(true);
    for (let i = 0; i < 6; i++) k.step(0.1); // one extra: float sums of 0.1 stop just short of 1
    expect(o.opacity).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    expect(o.exists()).toBe(false);
  });

  it("fadeOut without destroy keeps the object", async () => {
    const k = make();
    const o = k.add([k.box(), k.opacity()]);
    o.fadeOut(0.2);
    for (let i = 0; i < 3; i++) k.step(0.1);
    await new Promise((r) => setTimeout(r, 0));
    expect(o.exists()).toBe(true);
    expect(o.opacity).toBe(0);
  });
});

describe("material", () => {
  it("builds each type", () => {
    expect(createMaterial({ type: "basic" })).toBeInstanceOf(MeshBasicMaterial);
    expect(createMaterial({}).type).toBe("MeshStandardMaterial");
    expect(createMaterial({ type: "toon" }).type).toBe("MeshToonMaterial");
    expect(createMaterial({ type: "lambert" }).type).toBe("MeshLambertMaterial");
    expect(createMaterial({ type: "phong", flatShading: true }).type).toBe("MeshPhongMaterial");
    const std = createMaterial({ roughness: 0.1, metalness: 1, emissive: "#f00" });
    expect(std).toMatchObject({ roughness: 0.1, metalness: 1 });
  });

  it("repeatOf normalizes the repeat option", () => {
    expect(repeatOf(undefined)).toBeNull();
    expect(repeatOf(1)).toBeNull();
    expect(repeatOf(3)).toEqual([3, 3]);
    expect(repeatOf([2, 4])).toEqual([2, 4]);
  });

  it("replaces the mesh material and keeps sharing obj.color", () => {
    const k = make();
    const o = k.add([k.box(), k.color("red"), k.material({ type: "basic" })]);
    const mat = o.mesh.material as MeshBasicMaterial;
    expect(mat).toBe(o.material);
    expect(mat.type).toBe("MeshBasicMaterial");
    expect(mat.color).toBe(o.color);
  });

  it("works in any order and disposes the replaced default material", () => {
    const k = make();
    const spy = vi.spyOn(MeshStandardMaterial.prototype, "dispose");
    const o = k.add([k.material({ type: "lambert" }), k.box()]);
    expect(o.mesh.material).toBe(o.material);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("accepts a ready-made THREE.Material and never disposes it", () => {
    const k = make();
    const mat = new MeshBasicMaterial();
    const spy = vi.spyOn(mat, "dispose");
    const o = k.add([k.box(), k.material(mat)]);
    expect(o.mesh.material).toBe(mat);
    o.destroy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("resolves a texture name lazily through the assets plugin", () => {
    const tex = new Texture();
    let loaded = false;
    const assets = {
      name: "assets",
      install: () => ({ getTexture: (name: string) => (loaded && name === "grass" ? tex : null) }),
    };
    const k = make([assets]);
    const o = k.add([k.box(), k.material({ map: "grass" })]);
    expect((o.material as MeshStandardMaterial).map).toBeNull();
    loaded = true;
    k.step(0.016);
    expect((o.material as MeshStandardMaterial).map).toBe(tex);
  });

  it("repeat clones the texture instead of touching the shared one", () => {
    const k = make();
    const tex = new Texture();
    const o = k.add([k.plane(), k.material({ map: tex, repeat: [4, 2] })]);
    const map = (o.material as MeshStandardMaterial).map!;
    expect(map).not.toBe(tex);
    expect(map.repeat.toArray()).toEqual([4, 2]);
    expect(tex.repeat.toArray()).toEqual([1, 1]);
  });

  it("a texture name without the assets plugin is simply not applied", () => {
    const k = make();
    const o = k.add([k.box(), k.material({ map: "nope" })]);
    k.step(0.016);
    expect((o.material as MeshStandardMaterial).map).toBeNull();
  });
});

describe("materials: warnings and ownership", () => {
  it("createMaterial passes only the options that are set (three warns about undefined)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const type of ["standard", "basic", "toon", "lambert", "phong"] as const) {
      createMaterial({ type });
      createMaterial({ type, wireframe: true, flatShading: true });
    }
    expect(warn).not.toHaveBeenCalled();
    expect(createMaterial({ type: "basic", wireframe: true })).toMatchObject({ wireframe: true });
    warn.mockRestore();
  });

  it("opacity only touches the materials when the value (or the materials) changed", () => {
    const k = make();
    const o = k.add([k.box(), k.opacity(0.5)]);
    const mat = (o.mesh as Mesh).material as MeshStandardMaterial;
    expect(mat.opacity).toBe(0.5);
    mat.opacity = 0.9; // changed behind its back: not rewritten while obj.opacity is the same
    k.step(0.016);
    expect(mat.opacity).toBe(0.9);
    o.opacity = 0.2;
    k.step(0.016);
    expect(mat.opacity).toBeCloseTo(0.2);
    // swapping the materials is noticed too
    const other = new MeshStandardMaterial();
    (o.mesh as Mesh).material = other;
    k.step(0.016);
    expect(other.opacity).toBeCloseTo(0.2);
  });

  it("disposes the texture clone made by repeat and the owned material on destroy", () => {
    const k = make();
    const tex = new Texture();
    const o = k.add([k.box(), k.material({ map: tex, repeat: 4 })]);
    const mat = (o.mesh as Mesh).material as MeshStandardMaterial;
    const repeated = mat.map!;
    expect(repeated).not.toBe(tex);
    let texDisposed = 0;
    let matDisposed = 0;
    repeated.addEventListener("dispose", () => texDisposed++);
    mat.addEventListener("dispose", () => matDisposed++);
    let sharedDisposed = 0;
    tex.addEventListener("dispose", () => sharedDisposed++);
    o.destroy();
    expect(texDisposed).toBe(1);
    expect(matDisposed).toBeGreaterThanOrEqual(1);
    expect(sharedDisposed).toBe(0);
  });
});

describe("color() / opacity() on models", () => {
  const withModel = () => {
    const k = createEngine({ loop: "manual", renderer: "none" }, [
      renderPlugin,
      transformPlugin,
      shapesPlugin,
      assetsPlugin,
    ]) as Engine;
    const scene = new Group();
    const template = new MeshStandardMaterial({ color: 0xffffff });
    scene.add(new Mesh(new BoxGeometry(), template), new Mesh(new BoxGeometry(), template));
    k.defineModel("crate", scene);
    const mats = (o: { mesh: Object3D }) => {
      const out: MeshStandardMaterial[] = [];
      o.mesh.traverse((n) => {
        if ((n as Mesh).isMesh) out.push((n as Mesh).material as MeshStandardMaterial);
      });
      return out;
    };
    return { k, template, mats };
  };

  it("tint one instance without touching the template or the other instances", () => {
    const { k, template, mats } = withModel();
    const plain = k.add([k.model("crate")]);
    const red = k.add([k.model("crate"), k.color("#ff0000")]);
    expect(mats(plain)[0]).toBe(template);
    expect(mats(red)[0]).not.toBe(template);
    expect(mats(red)[0].color.getHexString()).toBe("ff0000");
    expect(mats(red)[0]).toBe(mats(red)[1]); // meshes that shared a material still do
    expect(template.color.getHexString()).toBe("ffffff");
    red.color.set("#00ff00");
    expect(mats(red)[0].color.getHexString()).toBe("00ff00");
    expect(template.color.getHexString()).toBe("ffffff");
  });

  it("fades one instance only, in any component order, and disposes the clones", () => {
    const { k, template, mats } = withModel();
    const other = k.add([k.model("crate")]);
    const ghost = k.add([k.opacity(0.3), k.model("crate")]);
    expect(mats(ghost)[0].opacity).toBeCloseTo(0.3);
    expect(mats(ghost)[0].transparent).toBe(true);
    expect(template.opacity).toBe(1);
    expect(mats(other)[0].opacity).toBe(1);
    const clone = mats(ghost)[0];
    let disposed = 0;
    clone.addEventListener("dispose", () => disposed++);
    ghost.destroy();
    expect(disposed).toBe(1);
    expect(template.transparent).toBe(false);
  });

  it("uniqueMaterials disposes its clones too", () => {
    const { k, mats } = withModel();
    const o = k.add([k.model("crate", { uniqueMaterials: true })]);
    const clone = mats(o)[0];
    let disposed = 0;
    clone.addEventListener("dispose", () => disposed++);
    o.destroy();
    expect(disposed).toBe(1);
  });
});
