import { RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { definePlugin } from "../../core/engine.js";
import type { Engine } from "../../core/types.js";
import { createModel, listNames } from "./model.js";
import type { AssetsAPI, ModelData } from "./types.js";

export type * from "./types.js";

/** Built-in plugin: `loadModel`, `loadTexture`, `model()` and friends. */
export const assetsPlugin = definePlugin<AssetsAPI>({
  name: "assets",
  dependencies: ["transform"],
  install(k: Engine) {
    let root = "";
    const models = new Map<string, ModelData>();
    const textures = new Map<string, Texture>();

    // Absolute URLs (`http:`, `data:`, `blob:`, `/…`) are never prefixed.
    const resolve = (url: string) => (/^([a-z][a-z0-9+.-]*:|\/)/i.test(url) ? url : root + url);

    function loadRoot(path?: string) {
      if (path !== undefined) root = path === "" || path.endsWith("/") ? path : `${path}/`;
      return root;
    }

    function defineModel(
      name: string,
      scene: ModelData["scene"],
      animations: ModelData["animations"] = [],
    ) {
      const data: ModelData = { scene, animations };
      models.set(name, data);
      return data;
    }

    function loadModel(name: string, url: string) {
      const task = new GLTFLoader()
        .loadAsync(resolve(url))
        .then((gltf) => defineModel(name, gltf.scene, gltf.animations));
      return k.load(task);
    }

    function loadTexture(name: string, url: string) {
      const task = new TextureLoader().loadAsync(resolve(url)).then((tex) => {
        tex.colorSpace = SRGBColorSpace;
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.needsUpdate = true;
        textures.set(name, tex);
        return tex;
      });
      return k.load(task);
    }

    return {
      loadRoot,
      loadModel,
      loadTexture,
      defineModel,
      getModel: (name) => models.get(name),
      getTexture: (name) => textures.get(name),
      model(name, opts = {}) {
        const data = models.get(name);
        if (!data) {
          throw new Error(
            `Model "${name}" is not loaded. Did you call loadModel("${name}", url) (or defineModel)? Loaded models: ${listNames(models.keys())}.`,
          );
        }
        return createModel(name, data, opts, k.dt);
      },
    };
  },
});
