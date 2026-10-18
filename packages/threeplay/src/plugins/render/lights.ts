import { DirectionalLight, type Light, type Object3D, PointLight, SpotLight } from "three";
import { toColor } from "../../core/math";
import { self } from "../../core/util";
import type { LightOpts, RenderAPI } from "./types";

type TargetedLight = Light & { target?: Object3D };

/** Attaches `light` (and its target, for directional and spot lights) to the object's node. */
function attach(obj: ReturnType<typeof self>, light: TargetedLight) {
  obj.object3d.add(light);
  if (light.target) {
    // Lights shine along the object's forward direction (-Z), like cameras.
    light.target.position.set(0, 0, -1);
    obj.object3d.add(light.target);
  }
}

function detach(light: TargetedLight) {
  light.target?.removeFromParent();
  light.removeFromParent();
  light.dispose();
}

/** Light components. They only need an object to hang from, so they work without `pos()` too. */
export function createLightComps(): Pick<RenderAPI, "pointLight" | "spotLight" | "dirLight"> {
  return {
    pointLight(opts: LightOpts & { distance?: number; decay?: number } = {}) {
      const light = new PointLight(
        toColor(opts.color ?? 0xffffff),
        opts.intensity ?? 20,
        opts.distance ?? 0,
        opts.decay ?? 2,
      );
      light.castShadow = opts.castShadow ?? false;
      return {
        id: "pointLight" as const,
        light,
        add() {
          attach(self(this), light);
        },
        destroy() {
          detach(light);
        },
      };
    },

    spotLight(opts: LightOpts & { angle?: number; distance?: number; penumbra?: number } = {}) {
      const light = new SpotLight(
        toColor(opts.color ?? 0xffffff),
        opts.intensity ?? 100,
        opts.distance ?? 0,
        ((opts.angle ?? 45) * Math.PI) / 180,
        opts.penumbra ?? 0.3,
      );
      light.castShadow = opts.castShadow ?? false;
      return {
        id: "spotLight" as const,
        light,
        add() {
          attach(self(this), light);
        },
        destroy() {
          detach(light);
        },
      };
    },

    dirLight(opts: LightOpts = {}) {
      const light = new DirectionalLight(toColor(opts.color ?? 0xffffff), opts.intensity ?? 2);
      light.castShadow = opts.castShadow ?? false;
      return {
        id: "dirLight" as const,
        light,
        add() {
          attach(self(this), light);
        },
        destroy() {
          detach(light);
        },
      };
    },
  };
}
