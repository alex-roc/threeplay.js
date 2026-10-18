import { PCFShadowMap, WebGPURenderer } from "three/webgpu";
import type { BackendOpts, RendererBackend, RendererKind } from "../types";

/**
 * `WebGPURenderer`. When the browser has no WebGPU, three falls back to its
 * WebGL2 backend by itself; `kind` reports what is really running.
 */
export function createWebGPUBackend(opts: BackendOpts): RendererBackend {
  const renderer = new WebGPURenderer({
    canvas: opts.canvas ?? undefined,
    antialias: opts.antialias,
    alpha: true,
  });
  renderer.shadowMap.enabled = opts.shadows;
  renderer.shadowMap.type = PCFShadowMap;
  let ready = false;
  return {
    get kind(): RendererKind {
      const backend = renderer.backend as { isWebGPUBackend?: boolean };
      return backend.isWebGPUBackend ? "webgpu" : "webgl";
    },
    canvas: renderer.domElement,
    three: renderer,
    async init() {
      await renderer.init();
      ready = true;
    },
    setSize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
    },
    render(scene, camera) {
      // `render()` throws until `init()` has finished.
      if (ready) renderer.render(scene, camera);
    },
    dispose: () => renderer.dispose(),
  };
}
