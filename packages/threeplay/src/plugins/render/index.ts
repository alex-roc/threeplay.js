import { type Color, Fog, FogExp2, Vector2, type Vector3 } from "three";
import { definePlugin } from "../../core/engine";
import { toColor } from "../../core/math";
import type { ColorLike, Engine } from "../../core/types";
import type { Vec3Like } from "../transform/types";
import { createNoneBackend } from "./backends/none";
import { barColor, computeLayout, type Layout, layoutChanged } from "./layout";
import { createDefaultLights } from "./lighting";
import { createLightComps } from "./lights";
import { showError, showLoadingBar } from "./loading";
import { projectToScreen, screenToRay } from "./project";
import { createStage } from "./stage";
import type { BackendOpts, FogOpts, RenderAPI, RendererBackend, RendererKind } from "./types";

export type * from "./types";

/** Default clear color: a soft sky blue. */
const DEFAULT_BACKGROUND = "#9fd3ff";
/** Logical size used when there is no DOM and no `width`/`height`. */
const HEADLESS_SIZE = { width: 1280, height: 720 };

/**
 * Built-in plugin: the three.js renderer (WebGPU with WebGL2 fallback, WebGL,
 * or headless), canvas layout, the HUD overlay, the default lighting and
 * screen projection helpers.
 */
export const renderPlugin = definePlugin<RenderAPI>({
  name: "render",
  install(k: Engine) {
    const o = k.opts;
    const requested = o.renderer ?? "auto";
    // Node (or any DOM-less host) can only be headless.
    const kind: RendererKind | "auto" = typeof document === "undefined" ? "none" : requested;
    const shadows = o.shadows ?? true;
    const fixedSize = o.width !== undefined && o.height !== undefined;
    const pixelRatio = o.pixelRatio ?? Math.min(globalThis.devicePixelRatio ?? 1, 2);

    // The canvas must exist right now: the input plugin listens on it next.
    const stage = kind === "none" ? null : createStage({ root: o.root, canvas: o.canvas });
    const canvas = stage?.canvas ?? null;

    // --- background and fog ---------------------------------------------------
    let background: Color | null = null;
    const setBackground = (c: ColorLike | null) => {
      background = c === null ? null : toColor(c);
      k.scene3d.background = background;
      if (stage && layout) stage.place(layout, barColor(background));
    };
    const setFog = (fog: FogOpts | null) => {
      if (!fog) {
        k.scene3d.fog = null;
        return;
      }
      const color = toColor(fog.color ?? background ?? 0xffffff);
      k.scene3d.fog =
        "density" in fog ? new FogExp2(color, fog.density) : new Fog(color, fog.near, fog.far);
    };

    // --- backend --------------------------------------------------------------
    // `renderer` is available at once; the real three.js renderer is loaded
    // lazily (own chunk) and swapped in when ready. Until then render is a no-op.
    let real: RendererBackend | null = null;
    let quit = false;
    let size = { width: 1, height: 1 };
    const backendOpts: BackendOpts = { canvas, antialias: o.antialias ?? true, shadows };

    const adopt = (backend: RendererBackend) => {
      real = backend;
      backend.setSize(size.width, size.height, pixelRatio);
    };
    async function loadBackend(want: "auto" | "webgpu" | "webgl") {
      const backend =
        want === "webgl"
          ? (await import("./backends/webgl")).createWebGLBackend(backendOpts)
          : (await import("./backends/webgpu")).createWebGPUBackend(backendOpts);
      await backend.init();
      if (quit) backend.dispose();
      else adopt(backend);
    }
    let ready: Promise<void> = Promise.resolve();
    if (kind === "none") adopt(createNoneBackend(backendOpts));
    else ready = k.load(loadBackend(kind));

    const renderer: RendererBackend = {
      get kind() {
        return real?.kind ?? (kind === "auto" ? "webgpu" : kind);
      },
      canvas,
      get three() {
        return real?.three ?? null;
      },
      init: () => ready,
      setSize(width, height, ratio) {
        size = { width, height };
        real?.setSize(width, height, ratio);
      },
      render: (scene, camera) => real?.render(scene, camera),
      dispose() {
        quit = true;
        real?.dispose();
      },
    };

    // --- layout ---------------------------------------------------------------
    let layout: Layout | null = null;
    let lastCamera: object | null = null;

    /** Keeps the camera's aspect equal to the drawn area, also after swapping `camera3d`. */
    function syncCamera() {
      if (!layout) return;
      const cam = k.camera3d;
      const aspect = layout.cssWidth / layout.cssHeight;
      if (cam === lastCamera && Math.abs(cam.aspect - aspect) < 1e-6) return;
      lastCamera = cam;
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }

    function applyLayout() {
      // Headless: the "container" is the fixed size, or a default one.
      const container = stage?.containerSize() ?? {
        width: o.width ?? HEADLESS_SIZE.width,
        height: o.height ?? HEADLESS_SIZE.height,
      };
      const next = computeLayout({
        containerWidth: container.width,
        containerHeight: container.height,
        width: fixedSize ? o.width : undefined,
        height: fixedSize ? o.height : undefined,
        letterbox: o.letterbox,
      });
      const changed = layoutChanged(layout, next);
      layout = next;
      stage?.place(next, barColor(background));
      renderer.setSize(next.cssWidth, next.cssHeight, pixelRatio);
      syncCamera();
      if (changed) k.trigger("threeplay:resize");
    }

    // --- lighting -------------------------------------------------------------
    const lights =
      (o.lighting ?? "default") === "default" ? createDefaultLights(k.scene3d, shadows) : null;

    // --- start ----------------------------------------------------------------
    setBackground(o.background === undefined ? DEFAULT_BACKGROUND : o.background);
    applyLayout();
    const stopObserving = stage?.observe(applyLayout);

    k.hooks.on("render", () => {
      syncCamera();
      lights?.follow(k.camera3d);
      renderer.render(k.scene3d, k.camera3d);
    });

    if (stage) {
      const stopLoading = showLoadingBar(stage.overlay, () => k.loadProgress());
      k.hooks.on("loaded", stopLoading);
      k.onQuit(stopLoading);
      k.hooks.on("error", (err) => showError(stage.overlay, err));
    }

    k.onQuit(() => {
      stopObserving?.();
      lights?.dispose();
      renderer.dispose();
      stage?.dispose();
    });

    return {
      renderer,
      canvas,
      width: () => layout!.width,
      height: () => layout!.height,
      center: () => new Vector2(layout!.width / 2, layout!.height / 2),
      setBackground,
      getBackground: () => background,
      setFog,
      get sun() {
        return lights?.sun ?? null;
      },
      get ambient() {
        return lights?.ambient ?? null;
      },
      setSunDirection(dir: Vec3Like) {
        lights?.setDirection(dir);
      },
      overlay: () => stage?.overlay ?? null,
      viewScale: () => layout!.scaleX,
      toScreen: (world: Vector3) =>
        projectToScreen(world, k.camera3d, layout!.width, layout!.height),
      screenRay: (screen: Vector2) =>
        screenToRay(screen, k.camera3d, layout!.width, layout!.height),
      screenshot() {
        if (!canvas || !real) return "";
        // Draw right before reading: WebGPU canvases are cleared once presented.
        real.render(k.scene3d, k.camera3d);
        return canvas.toDataURL("image/png");
      },
      onResize: (fn: () => void) => k.on("threeplay:resize", fn),
      ...createLightComps(),
    };
  },
});
