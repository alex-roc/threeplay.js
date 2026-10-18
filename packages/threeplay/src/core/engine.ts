import * as THREE from "three";
import { EventEmitter, HandlerList, joinControllers, Scope } from "./events.js";
import { type GameObjContext, GameObjImpl } from "./gameobj.js";
import { type Easing, easings, lerpValue, mathAPI } from "./math.js";
import type {
  CompList,
  Engine,
  EngineHooks,
  EventController,
  GameObj,
  GetOpts,
  Hooks,
  Plugin,
  PluginLike,
  SceneDef,
  Tag,
  ThreeplayOpts,
  TimerController,
  Tweenable,
} from "./types.js";

/**
 * Creates an engine with the given plugins installed, without touching
 * `window` and without starting the loop. `threeplay()` builds on this.
 */
export function createEngine(opts: ThreeplayOpts = {}, plugins: PluginLike[] = []): Engine {
  const fixedStep = 1 / (opts.fixedHz ?? 50);
  const maxDt = opts.maxDt ?? 0.1;
  const maxSubsteps = 5;

  // --- hooks (system level, never cleared) -------------------------------
  const hookEmitter = new EventEmitter();
  const hooks: Hooks = {
    on: (hook, fn) => hookEmitter.on(hook, fn as (...a: any[]) => void),
    emit: (hook, ...args) => hookEmitter.emit(hook, ...args),
  };

  // --- listener scopes ----------------------------------------------------
  // Listeners registered while a scene runs belong to it and die with it.
  // Listeners registered outside of any scene (top level, plugins) persist.
  const globalScope = new Scope();
  let sceneScope: Scope | null = null;
  let runningScene = false; // true while a scene body or a frame of it runs
  const track = <C extends EventController>(ctrl: C): C =>
    (runningScene && sceneScope ? sceneScope : globalScope).track(ctrl);

  const events = new EventEmitter(); // global user events
  const tagEvents = new EventEmitter(); // object events routed by tag

  // --- object tree --------------------------------------------------------
  const scene3d = new THREE.Scene();
  const camera3d = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  camera3d.position.set(0, 5, 10);
  camera3d.lookAt(0, 0, 0);

  const ctx: GameObjContext = {
    onEnter: (obj) => {
      hooks.emit("objectAdd", obj);
      events.emit("threeplay:add", obj);
    },
    onDestroy: (obj) => {
      hooks.emit("objectDestroy", obj);
      events.emit("threeplay:destroy", obj);
    },
    route: (obj, event, args) => {
      if (tagEvents.has(event)) tagEvents.emit(event, obj, ...args);
    },
  };
  const rootImpl = new GameObjImpl(ctx);
  rootImpl._markRoot();
  const root = rootImpl as unknown as GameObj;
  scene3d.add(root.object3d);

  // --- time ---------------------------------------------------------------
  let time = 0;
  let frameDt = 0;
  let timeScale = 1;
  let paused = false;
  let accumulator = 0;

  // --- loading ------------------------------------------------------------
  let pending = 0;
  let total = 0;
  let loaded = false;
  const loadList = new HandlerList();
  const checkLoaded = () => {
    if (loaded || pending > 0 || !installed) return;
    loaded = true;
    hooks.emit("loaded");
    loadList.emit();
    loadList.clear();
  };

  // --- scenes -------------------------------------------------------------
  const scenes = new Map<string, SceneDef>();
  let currentScene: string | null = null;
  let nextScene: { name: string; args: unknown[] } | null = null;
  const sceneLeave = new HandlerList();

  const doGo = (name: string, args: unknown[]) => {
    const def = scenes.get(name);
    if (!def) throw new Error(`Scene "${name}" is not defined. Call scene("${name}", ...) first.`);
    if (currentScene !== null) {
      hooks.emit("sceneLeave", currentScene);
      sceneLeave.emit(name);
    }
    sceneScope?.dispose();
    for (const child of root.children.slice()) child.destroy();
    accumulator = 0;
    sceneScope = new Scope();
    currentScene = name;
    hooks.emit("sceneEnter", name, args);
    const was = runningScene;
    runningScene = true;
    try {
      def(...args);
    } finally {
      runningScene = was;
    }
  };

  // --- timers -------------------------------------------------------------
  function makeTimer(tick: (dt: number) => boolean, onCancel?: () => void): TimerController {
    let finished = false;
    const done: Array<() => void> = [];
    const ctrl = onUpdateRaw(() => {
      if (tick(frameDt)) {
        finished = true;
        ctrl.cancel();
        for (const fn of done) fn();
      }
    });
    return {
      get paused() {
        return ctrl.paused;
      },
      set paused(p) {
        ctrl.paused = p;
      },
      cancel() {
        ctrl.cancel();
        onCancel?.();
      },
      get finished() {
        return finished;
      },
      // biome-ignore lint/suspicious/noThenProperty: timers are awaitable by design
      then(resolve, reject) {
        return new Promise<void>((res) => {
          if (finished) res();
          else done.push(res);
        }).then(resolve, reject);
      },
    };
  }

  const updateList = new HandlerList();
  const fixedList = new HandlerList();
  const onUpdateRaw = (fn: () => void) => track(updateList.add(fn));

  // --- the engine object --------------------------------------------------
  const pluginAPIs: Record<string, object> = {};
  let installed = false;
  let rafId = 0;
  let running = false;
  const quitList = new HandlerList();

  function frame(rawDt: number) {
    if (!loaded) return;
    if (nextScene) {
      const { name, args } = nextScene;
      nextScene = null;
      doGo(name, args);
    }
    const dt = Math.min(Math.max(rawDt, 0), maxDt) * timeScale;
    frameDt = paused ? 0 : dt;
    hooks.emit("frameStart", frameDt);
    if (!paused) {
      time += dt;
      accumulator += dt;
      let steps = 0;
      const step = fixedStep * timeScale;
      while (step > 0 && accumulator >= step - 1e-9) {
        hooks.emit("beforeFixedUpdate", step);
        rootImpl._fixedUpdate();
        fixedList.emit();
        hooks.emit("afterFixedUpdate", step);
        accumulator -= step;
        if (++steps >= maxSubsteps) {
          accumulator = 0;
          break;
        }
      }
      hooks.emit("beforeUpdate", dt);
      rootImpl._update();
      updateList.emit();
      hooks.emit("afterUpdate", dt);
      hooks.emit("lateUpdate", dt);
    }
    const step = fixedStep * timeScale;
    hooks.emit("render", step > 0 ? accumulator / step : 0);
    hooks.emit("frameEnd");
  }

  const core = {
    THREE,
    opts,
    root,
    scene3d,
    camera3d,
    hooks,
    plugins: pluginAPIs,
    ...mathAPI,

    add<T extends CompList>(comps?: readonly [...T]) {
      return root.add(comps);
    },
    destroy(obj: GameObj) {
      obj.destroy();
    },
    destroyAll(tag: Tag) {
      for (const obj of root.get(tag)) obj.destroy();
    },
    get(tag: Tag | Tag[], getOpts?: GetOpts) {
      return root.get(tag, getOpts);
    },

    on(event: string, tagOrFn: Tag | ((...a: any[]) => void), fn?: (...a: any[]) => void) {
      if (typeof tagOrFn === "function") return track(events.on(event, tagOrFn));
      const tag = tagOrFn;
      return track(
        tagEvents.on(event, (obj: GameObj, ...args: unknown[]) => {
          if (obj.is(tag)) fn!(obj, ...args);
        }),
      );
    },
    trigger(event: string, ...args: unknown[]) {
      events.emit(event, ...args);
    },
    onUpdate(tagOrFn: Tag | (() => void), fn?: (obj: GameObj) => void) {
      if (typeof tagOrFn === "function") return onUpdateRaw(tagOrFn);
      return core.on("update", tagOrFn, fn!);
    },
    onFixedUpdate(tagOrFn: Tag | (() => void), fn?: (obj: GameObj) => void) {
      if (typeof tagOrFn === "function") return track(fixedList.add(tagOrFn));
      return core.on("fixedUpdate", tagOrFn, fn!);
    },
    onAdd(tagOrFn: Tag | ((obj: GameObj) => void), fn?: (obj: GameObj) => void) {
      if (typeof tagOrFn === "function") return core.on("threeplay:add", tagOrFn);
      return core.on("add", tagOrFn, fn!);
    },
    onDestroy(tagOrFn: Tag | ((obj: GameObj) => void), fn?: (obj: GameObj) => void) {
      if (typeof tagOrFn === "function") return core.on("threeplay:destroy", tagOrFn);
      return core.on("destroy", tagOrFn, fn!);
    },
    onLoad(fn: () => void): EventController {
      if (loaded) {
        fn();
        return { paused: false, cancel() {} };
      }
      return loadList.add(fn);
    },
    onSceneLeave(fn: (next: string) => void) {
      return track(sceneLeave.add(fn));
    },

    scene(name: string, def: SceneDef) {
      scenes.set(name, def);
    },
    go(name: string, ...args: unknown[]) {
      if (!scenes.has(name)) {
        throw new Error(`Scene "${name}" is not defined. Call scene("${name}", ...) first.`);
      }
      nextScene = { name, args };
      // Outside of a running frame (e.g. right after setup) start it at once.
      if (loaded && !inFrame) {
        nextScene = null;
        doGo(name, args);
      }
    },
    getSceneName() {
      return currentScene;
    },

    dt: () => frameDt,
    fixedDt: () => fixedStep * timeScale,
    time: () => time,
    setTimeScale(scale: number) {
      timeScale = Math.max(0, scale);
    },
    getTimeScale: () => timeScale,
    setPaused(p: boolean) {
      paused = p;
    },
    isPaused: () => paused,

    wait(seconds: number, fn?: () => void) {
      let t = 0;
      return makeTimer((dt) => {
        t += dt;
        if (t < seconds) return false;
        fn?.();
        return true;
      });
    },
    loop(seconds: number, fn: () => void, count = Number.POSITIVE_INFINITY) {
      let t = 0;
      let runs = 0;
      if (count > 0) {
        fn();
        runs++;
      }
      return makeTimer((dt) => {
        if (runs >= count) return true;
        t += dt;
        while (t >= seconds && runs < count) {
          t -= seconds;
          fn();
          runs++;
        }
        return runs >= count;
      });
    },
    tween<V extends Tweenable>(
      from: V,
      to: V,
      duration: number,
      set: (value: V) => void,
      easing: Easing = easings.linear,
    ) {
      let t = 0;
      set(lerpValue(from, to, 0));
      return makeTimer((dt) => {
        t += dt;
        const p = duration <= 0 ? 1 : Math.min(t / duration, 1);
        set(lerpValue(from, to, easing(p)));
        return p >= 1;
      });
    },

    load<T>(task: Promise<T>) {
      pending++;
      total++;
      const settle = () => {
        pending--;
        checkLoaded();
      };
      task.then(settle, (err) => {
        console.error("[threeplay] loading failed:", err);
        settle();
      });
      return task;
    },
    loadProgress: () => (total === 0 ? 1 : (total - pending) / total),
    isLoaded: () => loaded,

    step(dt = fixedStep) {
      inFrame = true;
      runningScene = true;
      try {
        frame(dt);
      } finally {
        inFrame = false;
        runningScene = false;
      }
    },
    quit() {
      running = false;
      if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
      if (currentScene !== null) hooks.emit("sceneLeave", currentScene);
      for (const child of root.children.slice()) child.destroy();
      sceneScope?.dispose();
      globalScope.dispose();
      quitList.emit();
      quitList.clear();
      hookEmitter.clear();
    },
    onQuit(fn: () => void) {
      return quitList.add(fn);
    },
  };
  let inFrame = false;

  const k = core as unknown as Engine;

  // --- plugins ------------------------------------------------------------
  const owners = new Map<string, string>();
  for (const key of Object.keys(core)) owners.set(key, "core");
  for (const p of plugins) installPlugin(k, normalizePlugin(p), pluginAPIs, owners);
  installed = true;
  hooks.emit("init");

  // --- loop ---------------------------------------------------------------
  const startLoop = () => {
    if (running || (opts.loop ?? "auto") === "manual") return;
    if (typeof requestAnimationFrame !== "function") return;
    running = true;
    let last = performance.now();
    const tick = (now: number) => {
      if (!running) return;
      const dt = (now - last) / 1000;
      last = now;
      try {
        core.step(dt);
      } catch (err) {
        // Stop instead of freezing silently or spamming the same error every
        // frame; plugins (render) show it on screen through the hook.
        running = false;
        console.error("[threeplay] the game stopped because of an error:", err);
        hooks.emit("error", err);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };
  // Start once every plugin had a chance to register its loading tasks.
  queueMicrotask(() => {
    checkLoaded();
    startLoop();
  });
  // Synchronous setups (no loading tasks) are usable right away, e.g. in tests.
  if (pending === 0) checkLoaded();

  return k;
}

function normalizePlugin(p: PluginLike): Plugin<object> {
  if (typeof p === "function") return { name: p.name || "anonymous", install: p };
  return p;
}

function installPlugin(
  k: Engine,
  plugin: Plugin<object>,
  apis: Record<string, object>,
  owners: Map<string, string>,
) {
  if (apis[plugin.name] && plugin.name !== "anonymous") {
    throw new Error(`Plugin "${plugin.name}" is installed twice.`);
  }
  for (const dep of plugin.dependencies ?? []) {
    if (!apis[dep]) {
      throw new Error(`Plugin "${plugin.name}" needs plugin "${dep}", installed before it.`);
    }
  }
  const api = plugin.install(k) ?? {};
  const descs = Object.getOwnPropertyDescriptors(api);
  for (const key of Object.keys(descs)) {
    const owner = owners.get(key);
    if (owner) {
      throw new Error(
        `Plugin "${plugin.name}" can't define "${key}": it is already defined by ${owner === "core" ? "the core" : `plugin "${owner}"`}.`,
      );
    }
    Object.defineProperty(k, key, { ...descs[key], enumerable: true, configurable: true });
    owners.set(key, plugin.name);
  }
  apis[plugin.name] = api;
}

/** Defines a plugin with full typing. */
export function definePlugin<API extends object>(plugin: Plugin<API>): Plugin<API> {
  return plugin;
}

/** Type helper for `hooks.on` callbacks in plugins. */
export type HookFn<K extends keyof EngineHooks> = (...args: EngineHooks[K]) => void;

export { joinControllers };
