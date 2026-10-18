import type * as THREE from "three";
import type { Easing, mathAPI } from "./math";

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Handle returned by every `on*` function. */
export interface EventController {
  /** While `true` the handler is skipped. */
  paused: boolean;
  /** Removes the handler for good. */
  cancel(): void;
}

/** Handle returned by `wait()`, `loop()` and `tween()`. Awaitable. */
export interface TimerController extends EventController, PromiseLike<void> {
  /** `true` once the timer has run to completion (never for an endless `loop`). */
  readonly finished: boolean;
}

// ---------------------------------------------------------------------------
// Components and game objects
// ---------------------------------------------------------------------------

/** A tag is just a string attached to a game object. `"*"` matches every object. */
export type Tag = string;

/** Keys of a component that are lifecycle hooks, never merged into the object. */
export type CompLifecycleKey =
  | "id"
  | "require"
  | "add"
  | "update"
  | "fixedUpdate"
  | "destroy"
  | "inspect";

/**
 * A component is a plain object. Its fields and methods are merged into the
 * game object; the lifecycle hooks are called with `this` bound to the object.
 *
 * ```js
 * function spin(speed = 90) {
 *   return {
 *     id: "spin",
 *     require: ["rotate"],
 *     speed,
 *     update() { this.rot.y += this.speed * dt(); },
 *   };
 * }
 * ```
 */
export interface Comp {
  /** Unique name. Two components with the same id replace each other. */
  id?: string;
  /** Ids of components that must be present on the object. */
  require?: string[];
  /** Called when the object enters the scene (or when used on a live object). */
  add?(this: GameObj): void;
  /** Called once per frame. */
  update?(this: GameObj): void;
  /** Called at the fixed physics rate (50 Hz by default). */
  fixedUpdate?(this: GameObj): void;
  /** Called when the object is destroyed or the component removed. */
  destroy?(this: GameObj): void;
  /** Short status line shown by the debug inspector. */
  inspect?(this: GameObj): string | null | undefined;
}

/** What `add()` accepts: components, tags and plain objects with custom fields. */
export type CompList = ReadonlyArray<Comp | Tag | object>;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

/** Merges the fields of a list of components into one type (tags are dropped). */
export type MergeComps<T> =
  UnionToIntersection<T extends string ? never : Omit<T, CompLifecycleKey>> extends infer M
    ? { [K in keyof M]: M[K] }
    : never;

/** Options for `get()`. */
export interface GetOpts {
  /** Search the whole subtree (default `true`). */
  recursive?: boolean;
  /** With several tags: `"and"` (default) needs all of them, `"or"` any of them. */
  op?: "and" | "or";
}

/** The methods every game object has, whatever its components. */
export interface GameObjRaw {
  /** Unique, incremental id. */
  readonly id: number;
  /** The three.js node of this object. Children objects are nested inside it. */
  readonly object3d: THREE.Object3D;
  /** Parent object (`null` for the root or once destroyed). */
  readonly parent: GameObj | null;
  /** Direct children. */
  readonly children: readonly GameObj[];
  /** Tags of this object. */
  readonly tags: ReadonlySet<Tag>;
  /** A paused object (and its subtree) skips `update` and `fixedUpdate`. */
  paused: boolean;
  /** Hides the object (and its subtree) without destroying it. */
  hidden: boolean;

  /** Adds a child object. */
  add<T extends CompList>(comps?: readonly [...T]): GameObj<MergeComps<T[number]>>;
  /** Removes (destroys) a child. */
  remove(child: GameObj): void;
  /** Destroys this object and its subtree. */
  destroy(): void;
  /** `false` once destroyed. */
  exists(): boolean;
  /** Descendants with the given tag(s). */
  get(tag: Tag | Tag[], opts?: GetOpts): GameObj[];
  /** `true` if the object has every given tag. */
  is(tag: Tag | Tag[]): boolean;
  /** Adds tags. */
  tag(tag: Tag | Tag[]): void;
  /** Removes tags. */
  untag(tag: Tag | Tag[]): void;
  /** Adds a component (or a tag) to a live object. */
  use(comp: Comp | Tag | object): void;
  /** Removes a component by id. */
  unuse(id: string): void;
  /** `true` if the object has a component with that id. */
  has(id: string | string[]): boolean;
  /** The component with that id, if any. */
  c(id: string): Comp | undefined;
  /** Listens to an event of this object. */
  on(event: string, fn: (...args: any[]) => void): EventController;
  /** Emits an event on this object (also reaches `k.on(event, tag, fn)` listeners). */
  trigger(event: string, ...args: unknown[]): void;
  /** Runs every frame while the object exists. */
  onUpdate(fn: () => void): EventController;
  /** Runs at the fixed rate while the object exists. */
  onFixedUpdate(fn: () => void): EventController;
  /** Runs once when the object is destroyed. */
  onDestroy(fn: () => void): EventController;
  /** Status lines from every component, for debugging. */
  inspect(): Record<string, string>;
}

/**
 * A game object. `T` holds the fields contributed by its components, so
 * `add([pos(), health(3)])` returns an object typed with `pos` and `hp`.
 */
export type GameObj<T = Record<string, any>> = GameObjRaw & T;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Any color three.js understands, or `[r, g, b]` in 0–255. */
export type ColorLike = THREE.ColorRepresentation | readonly [number, number, number];

/**
 * Options of `threeplay()`. Plugins extend this interface with their own
 * options through declaration merging.
 */
export interface ThreeplayOpts {
  /** Put the API on `window` like kaplay does (default `true`). */
  global?: boolean;
  /** Extra plugins, installed after the built-in ones. */
  plugins?: PluginLike[];
  /** Fixed update rate in Hz, used by physics (default 50). */
  fixedHz?: number;
  /** `"auto"` drives the loop with requestAnimationFrame; `"manual"` waits for `k.step(dt)`. */
  loop?: "auto" | "manual";
  /** Largest frame delta in seconds; longer frames are clamped (default 0.1). */
  maxDt?: number;
  /** Plugin options (see each plugin). */
  [option: string]: unknown;
}

/** A plain set of values to tween. */
export type Tweenable = number | THREE.Vector2 | THREE.Vector3 | THREE.Color;

/**
 * System-level hooks used by plugins. They are never cleared by `go()`.
 * Plugins may add their own hooks through declaration merging.
 */
export interface EngineHooks {
  /** All plugins installed. */
  init: [];
  /** Every pending `load()` finished; the first scene can start. */
  loaded: [];
  /** Start of a frame, before any update. */
  frameStart: [dt: number];
  /** Before objects' `fixedUpdate` (e.g. sync kinematic bodies). */
  beforeFixedUpdate: [fixedDt: number];
  /** After objects' `fixedUpdate` (e.g. step the physics world). */
  afterFixedUpdate: [fixedDt: number];
  /** Before objects' `update`. */
  beforeUpdate: [dt: number];
  /** After objects' `update` (e.g. character controllers, then the camera). */
  afterUpdate: [dt: number];
  /** After every `afterUpdate`: positions are final (e.g. `follow()`, rotation sync). */
  lateUpdate: [dt: number];
  /** Time to draw. `alpha` is the fraction of a fixed step left over. */
  render: [alpha: number];
  /** End of a frame (e.g. clear "pressed this frame" input). */
  frameEnd: [];
  /** A scene is about to start. */
  sceneEnter: [name: string, args: unknown[]];
  /** A scene is ending: its objects and listeners are about to be cleared. */
  sceneLeave: [name: string];
  /** An object entered the tree (after its components' `add`). */
  objectAdd: [obj: GameObj];
  /** An object is being destroyed (before its node is detached). */
  objectDestroy: [obj: GameObj];
  /** An uncaught error stopped the loop (the render plugin shows it on screen). */
  error: [err: unknown];
}

/** Typed emitter for {@link EngineHooks}. */
export interface Hooks {
  on<K extends keyof EngineHooks>(hook: K, fn: (...args: EngineHooks[K]) => void): EventController;
  emit<K extends keyof EngineHooks>(hook: K, ...args: EngineHooks[K]): void;
}

/** The scene definition passed to `scene()`. */
export type SceneDef = (...args: any[]) => void;

/** The core API: object tree, events, scenes, time, timers and loading. */
export interface EngineCore {
  /** The three.js namespace bundled with the engine (escape hatch). */
  readonly THREE: typeof THREE;
  /** Options passed to `threeplay()`. */
  readonly opts: Readonly<ThreeplayOpts>;
  /** Root of the object tree. Every scene object is a descendant. */
  readonly root: GameObj;
  /** The three.js scene. `root.object3d` lives inside it. */
  readonly scene3d: THREE.Scene;
  /** The camera used to render. Replace it or move it at will. */
  camera3d: THREE.PerspectiveCamera;
  /** System hooks for plugins. */
  readonly hooks: Hooks;
  /** APIs of the installed plugins, by plugin name. */
  readonly plugins: Readonly<Record<string, object>>;

  // objects
  /** Adds an object to the scene. */
  add<T extends CompList>(comps?: readonly [...T]): GameObj<MergeComps<T[number]>>;
  /** Destroys an object. */
  destroy(obj: GameObj): void;
  /** Destroys every object with a tag. */
  destroyAll(tag: Tag): void;
  /** Objects with the given tag(s), searching the whole tree by default. */
  get(tag: Tag | Tag[], opts?: GetOpts): GameObj[];

  // events
  /** Global event listener, or per-tag object event listener with `on(event, tag, fn)`. */
  on(event: string, fn: (...args: any[]) => void): EventController;
  on(event: string, tag: Tag, fn: (obj: GameObj, ...args: any[]) => void): EventController;
  /** Emits a global event. */
  trigger(event: string, ...args: unknown[]): void;
  /** Every frame, or for every object with `tag` every frame. */
  onUpdate(fn: () => void): EventController;
  onUpdate(tag: Tag, fn: (obj: GameObj) => void): EventController;
  /** At the fixed rate, or for every object with `tag`. */
  onFixedUpdate(fn: () => void): EventController;
  onFixedUpdate(tag: Tag, fn: (obj: GameObj) => void): EventController;
  /** When any object (or one with `tag`) is added. */
  onAdd(fn: (obj: GameObj) => void): EventController;
  onAdd(tag: Tag, fn: (obj: GameObj) => void): EventController;
  /** When any object (or one with `tag`) is destroyed. */
  onDestroy(fn: (obj: GameObj) => void): EventController;
  onDestroy(tag: Tag, fn: (obj: GameObj) => void): EventController;
  /** When all assets are loaded (runs right away if they already are). */
  onLoad(fn: () => void): EventController;
  /** When the current scene ends. */
  onSceneLeave(fn: (next: string) => void): EventController;

  // scenes
  /** Defines a scene. */
  scene(name: string, def: SceneDef): void;
  /** Switches to a scene: clears objects and scene listeners, then runs it. */
  go(name: string, ...args: unknown[]): void;
  /** Name of the running scene. */
  getSceneName(): string | null;

  // time
  /** Seconds since the last frame (scaled). */
  dt(): number;
  /** Seconds of a fixed step (scaled). */
  fixedDt(): number;
  /** Seconds since start. */
  time(): number;
  /** Speeds up (>1) or slows down (<1) the game. */
  setTimeScale(scale: number): void;
  getTimeScale(): number;
  /** Pauses every update (rendering continues). */
  setPaused(paused: boolean): void;
  isPaused(): boolean;

  // timers
  /** Runs `fn` after `seconds` of game time. Awaitable. */
  wait(seconds: number, fn?: () => void): TimerController;
  /** Runs `fn` every `seconds` (right away first), `count` times or forever. */
  loop(seconds: number, fn: () => void, count?: number): TimerController;
  /** Animates a value from `from` to `to`, calling `set` each frame. */
  tween<V extends Tweenable>(
    from: V,
    to: V,
    duration: number,
    set: (value: V) => void,
    easing?: Easing,
  ): TimerController;

  // loading
  /** Registers a loading task. The first scene waits for every task. */
  load<T>(task: Promise<T>): Promise<T>;
  /** 0–1. */
  loadProgress(): number;
  isLoaded(): boolean;

  // loop
  /** Advances one frame by `dt` seconds (for `loop: "manual"` and tests). */
  step(dt?: number): void;
  /** Stops the loop and disposes every plugin. */
  quit(): void;
  /** Runs `fn` when the engine quits. */
  onQuit(fn: () => void): EventController;
}

/**
 * Registry of plugin APIs, filled by declaration merging:
 *
 * ```ts
 * declare module "threeplay" {
 *   interface PluginRegistry { myPlugin: MyPluginAPI }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: extended by declaration merging
export interface PluginRegistry {}

type PluginAPIs = UnionToIntersection<PluginRegistry[keyof PluginRegistry]>;

/** Math helpers on the engine: `vec3`, `rgb`, `rand`, `lerp`, `easings`… */
export type MathAPI = typeof mathAPI;

/** The engine context: the core API plus every registered plugin API. */
export type Engine = EngineCore & MathAPI & ([PluginAPIs] extends [never] ? unknown : PluginAPIs);

/**
 * A plugin adds functions, components and systems to the engine.
 * Whatever `install` returns is merged into `k` (and into `window` in global mode).
 */
export interface Plugin<API extends object = object> {
  /** Unique name; the API is also reachable at `k.plugins[name]`. */
  name: string;
  /** Names of plugins that must be installed before this one. */
  dependencies?: string[];
  /** Sets the plugin up. Use `k.hooks` for systems and `k.load()` for async work. */
  install(k: Engine): API;
}

/** A full plugin, or the kaplay-style shorthand `(k) => ({ ...api })`. */
export type PluginLike = Plugin<any> | ((k: Engine) => object);
