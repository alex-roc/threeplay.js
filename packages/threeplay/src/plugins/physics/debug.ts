import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";
import type { Engine } from "../../core/types";
import type { RapierBackend } from "./rapier";

/**
 * Draws Rapier's debug wireframe (colliders, contacts) as a `LineSegments`
 * in the scene. Only costs anything while it is on.
 */
export class DebugLines {
  private lines: LineSegments | null = null;

  constructor(
    private readonly k: Engine,
    private readonly backend: RapierBackend,
  ) {}

  /** Shows or hides the wireframe. */
  set(enabled: boolean) {
    if (enabled && !this.lines) {
      const material = new LineBasicMaterial({ vertexColors: true, depthTest: false });
      this.lines = new LineSegments(new BufferGeometry(), material);
      this.lines.frustumCulled = false;
      this.lines.renderOrder = 999;
      this.k.scene3d.add(this.lines);
    } else if (!enabled && this.lines) {
      this.lines.removeFromParent();
      this.lines.geometry.dispose();
      (this.lines.material as LineBasicMaterial).dispose();
      this.lines = null;
    }
  }

  /** Refreshes the wireframe from the world (call once per frame). */
  update() {
    const world = this.backend.world;
    if (!this.lines || !world) return;
    const { vertices, colors } = world.debugRender();
    const geo = this.lines.geometry;
    const pos = geo.getAttribute("position") as BufferAttribute | undefined;
    if (pos && pos.array.length === vertices.length) {
      (pos.array as Float32Array).set(vertices);
      pos.needsUpdate = true;
      const col = geo.getAttribute("color") as BufferAttribute;
      (col.array as Float32Array).set(colors);
      col.needsUpdate = true;
      return;
    }
    // The amount of lines changed: the buffers have to be recreated.
    geo.dispose(); // frees the old GPU buffers; the geometry stays usable
    geo.setAttribute("position", new BufferAttribute(vertices.slice(), 3));
    geo.setAttribute("color", new BufferAttribute(colors.slice(), 4));
  }
}
