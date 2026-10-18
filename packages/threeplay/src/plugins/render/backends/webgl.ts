import { PCFShadowMap, WebGLRenderer } from "three";
import type { BackendOpts, RendererBackend } from "../types";

/** Classic `WebGLRenderer`: maximum compatibility. */
export function createWebGLBackend(opts: BackendOpts): RendererBackend {
  const renderer = new WebGLRenderer({
    canvas: opts.canvas ?? undefined,
    antialias: opts.antialias,
    alpha: true,
    // Keeps the last frame readable, so `screenshot()` works at any time.
    preserveDrawingBuffer: true,
  });
  renderer.shadowMap.enabled = opts.shadows;
  renderer.shadowMap.type = PCFShadowMap;
  return {
    kind: "webgl",
    canvas: renderer.domElement,
    three: renderer,
    init: () => Promise.resolve(),
    setSize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      // `false`: the render plugin owns the canvas CSS box.
      renderer.setSize(width, height, false);
    },
    render: (scene, camera) => renderer.render(scene, camera),
    dispose: () => renderer.dispose(),
  };
}
