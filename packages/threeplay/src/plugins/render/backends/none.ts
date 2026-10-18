import type { BackendOpts, RendererBackend } from "../types";

/** Headless backend: no canvas, `render` does nothing. Used in Node and tests. */
export function createNoneBackend(_opts: BackendOpts): RendererBackend {
  return {
    kind: "none",
    canvas: null,
    three: null,
    init: () => Promise.resolve(),
    setSize() {},
    render() {},
    dispose() {},
  };
}
