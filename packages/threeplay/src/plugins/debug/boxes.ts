import { Box3, Box3Helper, Group, type Object3D, type Scene } from "three";
import type { GameObj } from "../../core/types";
import { isVisible } from "./inspect";

/**
 * Wireframe bounding boxes around every object with a `mesh`. Used by the
 * inspector when there is no physics plugin to draw colliders instead. The
 * helpers live in their own group of the scene, outside the object tree.
 */
export class BoxHelpers {
  private readonly group = new Group();
  private readonly boxes = new Map<GameObj, Box3Helper>();

  constructor(
    private readonly scene: Scene,
    private readonly objects: () => GameObj[],
    private readonly color = 0x00ff88,
  ) {
    this.group.name = "threeplay-debug";
  }

  /** Number of boxes currently drawn. */
  get size() {
    return this.boxes.size;
  }

  /** Brings the boxes up to date with the objects. */
  refresh() {
    if (!this.group.parent) this.scene.add(this.group);
    const seen = new Set<GameObj>();
    for (const obj of this.objects()) {
      const mesh = (obj as { mesh?: Object3D }).mesh;
      if (!mesh?.isObject3D || !obj.exists()) continue;
      seen.add(obj);
      let helper = this.boxes.get(obj);
      if (!helper) {
        helper = new Box3Helper(new Box3(), this.color);
        this.boxes.set(obj, helper);
        this.group.add(helper);
      }
      mesh.updateWorldMatrix(true, true);
      helper.box.setFromObject(mesh);
      helper.visible = !helper.box.isEmpty() && isVisible(mesh);
    }
    for (const [obj, helper] of this.boxes) {
      if (seen.has(obj)) continue;
      this.group.remove(helper);
      helper.dispose();
      this.boxes.delete(obj);
    }
  }

  /** Removes every box and takes the group out of the scene. */
  clear() {
    for (const helper of this.boxes.values()) {
      this.group.remove(helper);
      helper.dispose();
    }
    this.boxes.clear();
    this.group.removeFromParent();
  }
}
