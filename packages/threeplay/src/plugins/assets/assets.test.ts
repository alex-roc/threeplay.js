import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
  type Object3D,
  Skeleton,
  SkinnedMesh,
} from "three";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../core/engine.js";
import type { Engine } from "../../core/types.js";
import { renderPlugin } from "../render/index.js";
import { transformPlugin } from "../transform/index.js";
import { assetsPlugin } from "./index.js";

const make = () =>
  createEngine({ loop: "manual", renderer: "none", maxDt: 1 }, [
    renderPlugin,
    transformPlugin,
    assetsPlugin,
  ]) as Engine;

/** A 1×1×1 box standing on y=0.5, with two clips moving the model root on X. */
function defineBox(k: Engine, name = "box") {
  const scene = new Group();
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.position.y = 0.5;
  scene.add(mesh);
  const move = (clipName: string, to: number) =>
    new AnimationClip(clipName, 1, [new NumberKeyframeTrack(".position[x]", [0, 1], [0, to])]);
  return k.defineModel(name, scene, [move("walk", 10), move("jump", -10)]);
}

describe("assets: model()", () => {
  it("instances a model as the `mesh` child of object3d with a model shape", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.pos(), k.model("box")]);
    expect(o.shape).toEqual({ kind: "model" });
    expect(o.mesh.parent).toBe(o.object3d);
    expect(o.anims).toEqual(["walk", "jump"]);
    expect(k.getModel("box")?.animations.length).toBe(2);
  });

  it("faces forward() by default (180° around Y) and can opt out", () => {
    const k = make();
    defineBox(k);
    const a = k.add([k.model("box")]);
    const b = k.add([k.model("box", { faceForward: false })]);
    expect(a.mesh.rotation.y).toBeCloseTo(Math.PI);
    expect(b.mesh.rotation.y).toBe(0);
  });

  it("applies scale, shadows and ground alignment", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.model("box", { scale: 2, groundAlign: true })]);
    expect(o.mesh.scale.x).toBe(2);
    let lowest = Number.POSITIVE_INFINITY;
    o.mesh.updateMatrixWorld(true);
    o.mesh.traverse((n) => {
      const m = n as Mesh;
      if (m.isMesh) {
        expect(m.castShadow && m.receiveShadow).toBe(true);
        m.geometry.computeBoundingBox();
        lowest = Math.min(
          lowest,
          m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld).min.y,
        );
      }
    });
    expect(lowest).toBeCloseTo(0);
    const plain = k.add([k.model("box", { shadows: false })]);
    plain.mesh.traverse((n) => {
      if ((n as Mesh).isMesh) expect((n as Mesh).castShadow).toBe(false);
    });
  });

  it("clones instances: geometry shared, materials only with uniqueMaterials", () => {
    const k = make();
    const data = defineBox(k);
    const template = data.scene.children[0] as Mesh;
    const a = k.add([k.model("box")]);
    const b = k.add([k.model("box", { uniqueMaterials: true })]);
    const meshOf = (o: { mesh: Object3D }) => {
      let found: Mesh | undefined;
      o.mesh.traverse((n) => {
        if ((n as Mesh).isMesh) found = n as Mesh;
      });
      return found!;
    };
    expect(meshOf(a).geometry).toBe(template.geometry);
    expect(meshOf(a).material).toBe(template.material);
    expect(meshOf(b).material).not.toBe(template.material);
  });

  it("clones skinned meshes", () => {
    const k = make();
    const scene = new Group();
    const skinned = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
    const bone = new Bone();
    skinned.add(bone);
    skinned.bind(new Skeleton([bone]));
    scene.add(skinned);
    k.defineModel("skinned", scene);
    expect(() => k.add([k.model("skinned")])).not.toThrow();
  });

  it("throws helpful errors for unknown models and animations", () => {
    const k = make();
    expect(() => k.model("nope")).toThrow(/not loaded.*loadModel\("nope"/);
    defineBox(k);
    expect(() => k.model("nope")).toThrow(/Loaded models: box/);
    const o = k.add([k.model("box")]);
    expect(() => o.playAnim("fly")).toThrow(/no animation "fly".*walk, jump/);
    k.defineModel("still", new Group());
    const s = k.add([k.model("still")]);
    expect(s.mixer).toBeNull();
    expect(() => s.playAnim("walk")).toThrow(/Available animations: none/);
  });
});

describe("assets: animations", () => {
  const inner = (o: { mesh: Object3D }) => o.mesh.children[0];

  it("plays an animation, ticking the mixer with dt", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.model("box", { anim: "walk" })]);
    expect(o.curAnim()).toBe("walk");
    k.step(0.5);
    expect(inner(o).position.x).toBeCloseTo(5);
    k.step(0.25);
    expect(inner(o).position.x).toBeCloseTo(7.5);
  });

  it("cross-fades into another animation", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.model("box")]);
    o.playAnim("walk");
    k.step(0.5);
    o.playAnim("jump", { fade: 0.5 });
    expect(o.curAnim()).toBe("jump");
    k.step(0.25); // jump at x=-2.5 with weight .5, walk at x=7.5 with weight .5
    expect(inner(o).position.x).toBeCloseTo(2.5, 1);
  });

  it("does not restart the animation that is already running", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.model("box")]);
    o.playAnim("walk");
    k.step(0.5);
    o.playAnim("walk"); // e.g. called every frame by game code
    k.step(0.25);
    expect(inner(o).position.x).toBeCloseTo(7.5);
  });

  it("fires animEnd for non-looping animations and holds the last pose", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.model("box")]);
    const ended: string[] = [];
    o.onAnimEnd((n) => ended.push(n));
    o.playAnim("walk", { loop: false, fade: 0 });
    k.step(0.5);
    expect(ended).toEqual([]);
    k.step(0.75);
    expect(ended).toEqual(["walk"]);
    expect(inner(o).position.x).toBeCloseTo(10);
  });

  it("stopAnim clears the current animation; speed scales playback", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.model("box")]);
    o.playAnim("walk", { speed: 2 });
    k.step(0.25);
    expect(inner(o).position.x).toBeCloseTo(5);
    o.stopAnim();
    expect(o.curAnim()).toBeNull();
  });

  it("does not tick while the object is paused", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.model("box", { anim: "walk" })]);
    o.paused = true;
    k.step(0.5);
    expect(inner(o).position.x).toBeCloseTo(0);
  });

  it("detaches the instance when the object is destroyed", () => {
    const k = make();
    defineBox(k);
    const o = k.add([k.model("box", { anim: "walk" })]);
    const mesh = o.mesh;
    o.destroy();
    expect(mesh.parent).toBeNull();
  });
});

describe("assets: urls and textures", () => {
  it("loadRoot prefixes relative URLs only", () => {
    const k = make();
    expect(k.loadRoot()).toBe("");
    expect(k.loadRoot("assets")).toBe("assets/");
    expect(k.loadRoot("cdn/v1/")).toBe("cdn/v1/");
    expect(k.loadRoot("")).toBe("");
  });

  it("getTexture is undefined until loaded", () => {
    expect(make().getTexture("none")).toBeUndefined();
  });
});
