import { Raycaster } from "three";
import { definePlugin } from "../../core/engine";
import type { Engine } from "../../core/types";
import { BoxHelpers } from "./boxes";
import { FpsMeter } from "./fps";
import { describeObject, pickObject } from "./inspect";
import { formatMessage, LogBuffer } from "./log";
import { DebugUI } from "./panel";
import type { Debug, DebugAPI } from "./types";

export type * from "./types";

/** Built-in plugin: the `debug` object, an inspector panel and an on-screen log. */
export const debugPlugin = definePlugin<DebugAPI>({
  name: "debug",
  dependencies: ["render"],
  install(k: Engine) {
    const fps = new FpsMeter();
    const logBuffer = new LogBuffer();
    const raycaster = new Raycaster();
    let inspecting = false;
    let ui: DebugUI | null = null;

    /** The DOM, created on first need. `null` while there is no overlay (headless). */
    const getUI = () => {
      if (ui) return ui;
      const overlay = k.overlay?.() ?? null;
      if (overlay && typeof document !== "undefined") {
        ui = new DebugUI(overlay);
        ui.setPanelVisible(inspecting);
      }
      return ui;
    };

    // Without a physics plugin to draw colliders, outline the objects' meshes.
    const boxes = new BoxHelpers(k.scene3d, () => k.get("*"));
    const drawsBoxes = () => inspecting && !("physics" in k.plugins);

    function hovered() {
      const screen = k.mousePos?.();
      const ray = screen && k.screenRay?.(screen);
      if (!ray) return null;
      raycaster.camera = k.camera3d;
      return pickObject(raycaster, ray, k.root.object3d);
    }

    function panelText() {
      const lines = [`FPS ${Math.round(fps.value)}  objects ${debug.objectCount()}`];
      const info = (k.renderer?.three as { info?: { render?: { calls?: number } } } | null)?.info;
      const calls = info?.render?.calls;
      lines.push(
        `${k.renderer?.kind ?? "no renderer"}${calls === undefined ? "" : `  draw calls ${calls}`}`,
      );
      const obj = hovered();
      if (obj) lines.push("", ...describeObject(obj));
      return lines.join("\n");
    }

    const debug: Debug = {
      get inspect() {
        return inspecting;
      },
      set inspect(on: boolean) {
        if (on === inspecting) return;
        inspecting = on;
        k.hooks.emit("debugInspect", on);
        getUI()?.setPanelVisible(on);
        if (!on) boxes.clear();
        else if (drawsBoxes()) boxes.refresh();
      },
      get paused() {
        return k.isPaused();
      },
      set paused(p: boolean) {
        k.setPaused(p);
      },
      get timeScale() {
        return k.getTimeScale();
      },
      set timeScale(s: number) {
        k.setTimeScale(s);
      },
      fps: () => fps.value,
      objectCount: () => k.get("*").length,
      hovered,
      log(...msg: unknown[]) {
        console.log(...msg);
        logBuffer.push(formatMessage(msg));
      },
      error(...msg: unknown[]) {
        console.error(...msg);
        logBuffer.push(formatMessage(msg), true);
      },
      clearLog() {
        logBuffer.clear();
      },
    };

    // Real time (not the scaled dt) drives the FPS meter and the log fade,
    // so both keep working while the game is paused.
    k.hooks.on("frameStart", () => {
      const real = fps.tick(performance.now());
      logBuffer.tick(Math.min(real, 1));
      if (drawsBoxes() && k.isPaused()) boxes.refresh();
    });
    k.hooks.on("afterUpdate", () => {
      if (drawsBoxes()) boxes.refresh();
    });
    k.hooks.on("frameEnd", () => {
      const view = getUI();
      if (!view) return;
      view.setLog(logBuffer.lines, (line) => logBuffer.opacity(line));
      if (inspecting) view.setPanelText(panelText());
    });

    const key = k.opts.debugKey ?? "f1";
    if (key !== false && typeof k.onKeyPress === "function") {
      // Registered at install: a global listener that survives scene changes.
      k.onKeyPress(key, () => {
        debug.inspect = !debug.inspect;
      });
    }
    if (k.opts.debug) debug.inspect = true;

    k.onQuit(() => {
      boxes.clear();
      ui?.dispose();
      ui = null;
    });

    return { debug };
  },
});
