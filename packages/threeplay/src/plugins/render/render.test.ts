import { Color, PerspectiveCamera, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../core/engine";
import type { Engine } from "../../core/types";
import { transformPlugin } from "../transform";
import { renderPlugin } from ".";
import { barColor, computeLayout, layoutChanged } from "./layout";
import { createDefaultLights, SHADOW_EXTENT, snapToTexel, sunFocus } from "./lighting";
import { projectToScreen, screenToRay } from "./project";

const make = (opts = {}) =>
  createEngine({ loop: "manual", renderer: "none", ...opts }, [
    renderPlugin,
    transformPlugin,
  ]) as Engine;

describe("layout math", () => {
  it("fills the container when there is no fixed size", () => {
    const l = computeLayout({ containerWidth: 800, containerHeight: 600 });
    expect([l.width, l.height, l.cssWidth, l.cssHeight]).toEqual([800, 600, 800, 600]);
    expect([l.offsetX, l.offsetY, l.scaleX, l.scaleY]).toEqual([0, 0, 1, 1]);
  });

  it("letterboxes a fixed size: pillarbox in a wide container", () => {
    const l = computeLayout({
      containerWidth: 1600,
      containerHeight: 600,
      width: 400,
      height: 300,
    });
    expect([l.width, l.height]).toEqual([400, 300]);
    expect(l.scaleX).toBe(2);
    expect([l.cssWidth, l.cssHeight]).toEqual([800, 600]);
    expect([l.offsetX, l.offsetY]).toEqual([400, 0]);
  });

  it("letterboxes a fixed size: bars on top and bottom in a tall container", () => {
    const l = computeLayout({
      containerWidth: 400,
      containerHeight: 800,
      width: 400,
      height: 300,
    });
    expect([l.cssWidth, l.cssHeight]).toEqual([400, 300]);
    expect([l.offsetX, l.offsetY]).toEqual([0, 250]);
  });

  it("stretches with letterbox: false", () => {
    const l = computeLayout({
      containerWidth: 800,
      containerHeight: 300,
      width: 400,
      height: 300,
      letterbox: false,
    });
    expect([l.cssWidth, l.cssHeight, l.offsetX, l.offsetY]).toEqual([800, 300, 0, 0]);
    expect([l.scaleX, l.scaleY]).toEqual([2, 1]);
  });

  it("survives an empty container", () => {
    const l = computeLayout({ containerWidth: 0, containerHeight: 0 });
    expect([l.width, l.height]).toEqual([1, 1]);
  });

  it("layoutChanged only reports observable changes", () => {
    const a = computeLayout({ containerWidth: 800, containerHeight: 600 });
    expect(layoutChanged(null, a)).toBe(true);
    expect(layoutChanged(a, { ...a })).toBe(false);
    expect(layoutChanged(a, { ...a, offsetX: 10 })).toBe(false);
    expect(layoutChanged(a, { ...a, width: 801 })).toBe(true);
  });

  it("bars are the background darkened, or black", () => {
    expect(barColor(null)).toBe("#000");
    expect(barColor(new Color(1, 1, 1), 0)).toBe("#000000");
  });
});

describe("projection", () => {
  const cam = new PerspectiveCamera(60, 2, 0.1, 100);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();

  it("maps what the camera looks at to the screen center", () => {
    const p = projectToScreen(new Vector3(0, 0, 0), cam, 800, 400)!;
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(200);
  });

  it("has y growing downwards and x to the right", () => {
    const p = projectToScreen(new Vector3(1, 1, 0), cam, 800, 400)!;
    expect(p.x).toBeGreaterThan(400);
    expect(p.y).toBeLessThan(200);
  });

  it("returns null behind the camera", () => {
    expect(projectToScreen(new Vector3(0, 0, 20), cam, 800, 400)).toBeNull();
  });

  it("screenToRay is the inverse of projectToScreen", () => {
    const target = new Vector3(2, -1, -3);
    const s = projectToScreen(target, cam, 800, 400)!;
    const ray = screenToRay(s, cam, 800, 400);
    expect(ray.origin.distanceTo(cam.position)).toBeCloseTo(0);
    const toTarget = target.clone().sub(cam.position).normalize();
    expect(ray.direction.dot(toTarget)).toBeCloseTo(1);
  });
});

describe("sun shadow box", () => {
  it("centers on the ground hit when looking down", () => {
    const f = sunFocus(new Vector3(0, 10, 10), new Vector3(0, -1, -1).normalize());
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(0);
  });

  it("goes ahead of the camera when looking at the horizon", () => {
    const f = sunFocus(new Vector3(5, 1, 0), new Vector3(0, 0, -1));
    expect(f.z).toBeCloseTo(-SHADOW_EXTENT);
  });

  it("snaps to the texel grid in light space, and is idempotent", () => {
    const dir = new Vector3(-20, -30, -12).normalize();
    const p = new Vector3(3.3333, 1.2, -7.77);
    const once = snapToTexel(p, dir, 0.1);
    const twice = snapToTexel(once, dir, 0.1);
    expect(twice.distanceTo(once)).toBeLessThan(1e-9);
    expect(once.distanceTo(p)).toBeLessThan(0.15);
  });

  it("follow() moves the sun and its target with the camera", () => {
    const k = make();
    const lights = createDefaultLights(k.scene3d, true);
    const cam = new PerspectiveCamera();
    cam.position.set(100, 10, 100);
    cam.lookAt(100, 0, 90);
    cam.updateMatrixWorld();
    lights.follow(cam);
    expect(lights.sun.target.position.x).toBeCloseTo(100, 0);
    expect(lights.sun.position.y).toBeGreaterThan(20);
    lights.dispose();
    expect(k.scene3d.children).not.toContain(lights.sun);
  });

  it("setDirection() re-aims the sun and follow() keeps that direction", () => {
    const k = make();
    const lights = createDefaultLights(k.scene3d, true);
    const cam = new PerspectiveCamera();
    cam.position.set(0, 10, 10);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    lights.setDirection({ x: 0, y: -1, z: 0 }); // straight down
    lights.follow(cam);
    const off = lights.sun.position.clone().sub(lights.sun.target.position);
    expect(off.x).toBeCloseTo(0, 3);
    expect(off.z).toBeCloseTo(0, 3);
    expect(off.y).toBeGreaterThan(30);
    lights.follow(cam);
    expect(lights.sun.position.clone().sub(lights.sun.target.position).y).toBeCloseTo(off.y, 5);
    expect(() => lights.setDirection({ x: 0, y: 0, z: 0 })).toThrow(/non-zero direction/);
    lights.dispose();
  });
});

describe("render plugin (headless)", () => {
  it("is headless without a DOM: no canvas, no overlay", () => {
    const k = make();
    expect(k.renderer.kind).toBe("none");
    expect(k.canvas).toBeNull();
    expect(k.overlay()).toBeNull();
    k.step(0.016); // renders nothing, must not throw
  });

  it("picks the headless backend by itself in Node", () => {
    const k = createEngine({ loop: "manual" }, [renderPlugin]) as Engine;
    expect(k.renderer.kind).toBe("none");
    expect(k.isLoaded()).toBe(true);
  });

  it("has a default logical size, or the one asked for", () => {
    const a = make();
    expect([a.width(), a.height()]).toEqual([1280, 720]);
    const b = make({ width: 320, height: 200 });
    expect([b.width(), b.height()]).toEqual([320, 200]);
    expect(b.center().toArray()).toEqual([160, 100]);
    expect(b.viewScale()).toBe(1);
  });

  it("keeps the camera aspect equal to the drawn area, also after swapping the camera", () => {
    const k = make({ width: 400, height: 200 });
    expect(k.camera3d.aspect).toBeCloseTo(2);
    k.camera3d = new PerspectiveCamera(70, 1, 0.1, 100);
    k.step(0.016);
    expect(k.camera3d.aspect).toBeCloseTo(2);
  });

  it("toScreen and screenRay use logical coordinates", () => {
    const k = make({ width: 800, height: 400 });
    k.camera3d.position.set(0, 0, 10);
    k.camera3d.lookAt(0, 0, 0);
    const p = k.toScreen(new Vector3(0, 0, 0))!;
    expect([Math.round(p.x), Math.round(p.y)]).toEqual([400, 200]);
    expect(k.toScreen(new Vector3(0, 0, 50))).toBeNull();
    const ray = k.screenRay(new Vector2(400, 200));
    expect(ray.direction.z).toBeCloseTo(-1);
  });

  it("background: sky blue by default, null for transparent, settable", () => {
    const k = make();
    expect(k.getBackground()!.getHexString()).toBe("9fd3ff");
    expect(k.scene3d.background).toBe(k.getBackground());
    k.setBackground("#ff0000");
    expect(k.getBackground()!.getHexString()).toBe("ff0000");
    k.setBackground(null);
    expect(k.getBackground()).toBeNull();
    expect(k.scene3d.background).toBeNull();
    expect(make({ background: null }).getBackground()).toBeNull();
  });

  it("setFog builds linear and exponential fog, and removes it", () => {
    const k = make();
    k.setFog({ near: 5, far: 50 });
    expect(k.scene3d.fog).toMatchObject({ near: 5, far: 50 });
    k.setFog({ density: 0.02, color: "#fff" });
    expect(k.scene3d.fog).toMatchObject({ density: 0.02 });
    k.setFog(null);
    expect(k.scene3d.fog).toBeNull();
  });

  it("default lighting lives in the scene, outside the object tree", () => {
    const k = make();
    expect(k.sun).not.toBeNull();
    expect(k.sun!.castShadow).toBe(true);
    expect(k.sun!.shadow.mapSize.x).toBe(2048);
    expect(k.scene3d.children).toContain(k.sun);
    expect(k.scene3d.children).toContain(k.ambient);
    // go() destroys the root's children: the lights must not be among them.
    k.scene("a", () => {});
    k.go("a");
    expect(k.scene3d.children).toContain(k.sun);
    expect(k.root.object3d.children).not.toContain(k.sun);
  });

  it("lighting: none and shadows: false", () => {
    const none = make({ lighting: "none" });
    expect(none.sun).toBeNull();
    expect(none.ambient).toBeNull();
    expect(make({ shadows: false }).sun!.castShadow).toBe(false);
  });

  it("the sun follows the camera on render", () => {
    const k = make();
    k.camera3d.position.set(200, 10, 200);
    k.camera3d.lookAt(200, 0, 190);
    k.step(0.016);
    expect(k.sun!.target.position.x).toBeCloseTo(200, 0);
  });

  it("setSunDirection() survives the follow logic; it is a no-op without lighting", () => {
    const k = make();
    k.setSunDirection({ x: 1, y: -1, z: 0 });
    k.camera3d.position.set(0, 10, 10);
    k.camera3d.lookAt(0, 0, 0);
    k.step(0.016);
    k.step(0.016);
    const off = k.sun!.position.clone().sub(k.sun!.target.position).normalize();
    expect(off.x).toBeCloseTo(-Math.SQRT1_2, 3); // the sun sits on the opposite side
    expect(off.y).toBeCloseTo(Math.SQRT1_2, 3);
    expect(() => make({ lighting: "none" }).setSunDirection({ x: 0, y: -1, z: 0 })).not.toThrow();
  });

  it("onResize is scene scoped like other listeners", () => {
    const k = make();
    let global = 0;
    let scoped = 0;
    k.onResize(() => global++);
    k.scene("a", () => {
      k.onResize(() => scoped++);
    });
    k.scene("b", () => {});
    k.go("a");
    k.trigger("threeplay:resize");
    expect([global, scoped]).toEqual([1, 1]);
    k.go("b");
    k.trigger("threeplay:resize");
    expect([global, scoped]).toEqual([2, 1]);
  });

  it("pointLight/spotLight/dirLight attach to the object and clean up", () => {
    const k = make();
    const o = k.add([k.pos(1, 2, 3), k.pointLight({ intensity: 7, color: "#f00" })]);
    expect(o.light.parent).toBe(o.object3d);
    expect(o.light.intensity).toBe(7);
    expect(o.light.color.getHexString()).toBe("ff0000");
    const s = k.add([k.spotLight({ angle: 30, castShadow: true })]);
    expect(s.light.angle).toBeCloseTo(Math.PI / 6);
    expect(s.light.castShadow).toBe(true);
    expect(s.light.target.parent).toBe(s.object3d);
    const d = k.add([k.dirLight()]);
    expect(d.light.parent).toBe(d.object3d);
    o.destroy();
    expect(o.object3d.children).not.toContain(o.light);
    s.destroy();
    expect(s.light.target.parent).toBeNull();
  });

  it("quit() disposes without throwing", () => {
    const k = make();
    k.quit();
    expect(k.scene3d.children).not.toContain(k.sun);
  });

  it("screenshot is empty when headless", () => {
    expect(make().screenshot()).toBe("");
  });
});
