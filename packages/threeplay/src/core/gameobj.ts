import type { Object3D } from "three";
import { Group } from "three";
import { EventEmitter } from "./events";
import type {
  Comp,
  CompList,
  EventController,
  GameObj,
  GameObjRaw,
  GetOpts,
  MergeComps,
  Tag,
} from "./types";

const LIFECYCLE = new Set(["id", "require", "add", "update", "fixedUpdate", "destroy", "inspect"]);

/** What a game object needs from the engine. */
export interface GameObjContext {
  /** Called once the object entered the tree. */
  onEnter(obj: GameObj): void;
  /** Called when the object is being destroyed. */
  onDestroy(obj: GameObj): void;
  /** Forwards object events to `k.on(event, tag, fn)` listeners. */
  route(obj: GameObj, event: string, args: unknown[]): void;
}

let nextId = 0;
let anonId = 0;

interface CompEntry {
  key: string;
  comp: Comp;
  props: string[];
}

/** Implementation of {@link GameObjRaw}. Components add their fields on top. */
export class GameObjImpl implements GameObjRaw {
  readonly id = nextId++;
  readonly object3d: Object3D;
  parent: GameObj | null = null;
  readonly children: GameObj[] = [];
  readonly tags = new Set<Tag>();
  paused = false;

  /** @internal */ _alive = true;
  /** @internal */ _inTree = false;
  /** @internal */ readonly _comps: CompEntry[] = [];
  /** @internal */ readonly _events = new EventEmitter();
  /** @internal */ readonly _ctx: GameObjContext;

  constructor(ctx: GameObjContext, object3d: Object3D = new Group()) {
    this._ctx = ctx;
    this.object3d = object3d;
    object3d.userData.gameObj = this;
  }

  get hidden() {
    return !this.object3d.visible;
  }

  set hidden(h: boolean) {
    this.object3d.visible = !h;
  }

  add<T extends CompList>(
    comps: readonly [...T] = [] as unknown as readonly [...T],
  ): GameObj<MergeComps<T[number]>> {
    const child = new GameObjImpl(this._ctx);
    for (const c of comps) child._use(c);
    for (const entry of child._comps) child._checkRequire(entry.comp);
    this._attach(child as unknown as GameObj);
    return child as unknown as GameObj<MergeComps<T[number]>>;
  }

  remove(child: GameObj) {
    if (child.parent === (this as unknown as GameObj)) child.destroy();
  }

  destroy() {
    if (!this._alive) return;
    this._alive = false;
    for (const child of this.children.slice()) child.destroy();
    for (const entry of this._comps.slice().reverse()) entry.comp.destroy?.call(this as any);
    this.trigger("destroy");
    this._ctx.onDestroy(this as unknown as GameObj);
    this.object3d.removeFromParent();
    const parent = this.parent as unknown as GameObjImpl | null;
    if (parent) {
      const i = parent.children.indexOf(this as unknown as GameObj);
      if (i >= 0) parent.children.splice(i, 1);
    }
    this.parent = null;
    this._inTree = false;
    this._events.clear();
  }

  exists() {
    return this._alive;
  }

  get(tag: Tag | Tag[], opts: GetOpts = {}): GameObj[] {
    const recursive = opts.recursive ?? true;
    const out: GameObj[] = [];
    const visit = (obj: GameObj) => {
      for (const child of obj.children) {
        if (matches(child, tag, opts.op)) out.push(child);
        if (recursive) visit(child);
      }
    };
    visit(this as unknown as GameObj);
    return out;
  }

  is(tag: Tag | Tag[]) {
    if (Array.isArray(tag)) return tag.every((t) => t === "*" || this.tags.has(t));
    return tag === "*" || this.tags.has(tag);
  }

  tag(tag: Tag | Tag[]) {
    for (const t of Array.isArray(tag) ? tag : [tag]) this.tags.add(t);
  }

  untag(tag: Tag | Tag[]) {
    for (const t of Array.isArray(tag) ? tag : [tag]) this.tags.delete(t);
  }

  use(comp: Comp | Tag | object) {
    const entry = this._use(comp);
    if (!entry) return;
    this._checkRequire(entry.comp);
    if (this._inTree) entry.comp.add?.call(this as any);
  }

  unuse(id: string) {
    const i = this._comps.findIndex((e) => e.key === id);
    if (i < 0) return;
    const dependent = this._comps.find((e) => e.comp.require?.includes(id));
    if (dependent) {
      throw new Error(`Can't remove component "${id}": component "${dependent.key}" requires it.`);
    }
    this._remove(id);
  }

  private _remove(id: string) {
    const i = this._comps.findIndex((e) => e.key === id);
    if (i < 0) return;
    const [entry] = this._comps.splice(i, 1);
    entry.comp.destroy?.call(this as any);
    for (const p of entry.props) delete (this as any)[p];
  }

  has(id: string | string[]) {
    const ids = Array.isArray(id) ? id : [id];
    return ids.every((i) => this._comps.some((e) => e.key === i));
  }

  c(id: string) {
    return this._comps.find((e) => e.key === id)?.comp;
  }

  on(event: string, fn: (...args: any[]) => void): EventController {
    return this._events.on(event, fn);
  }

  trigger(event: string, ...args: unknown[]) {
    this._events.emit(event, ...args);
    this._ctx.route(this as unknown as GameObj, event, args);
  }

  onUpdate(fn: () => void) {
    return this.on("update", fn);
  }

  onFixedUpdate(fn: () => void) {
    return this.on("fixedUpdate", fn);
  }

  onDestroy(fn: () => void) {
    return this.on("destroy", fn);
  }

  inspect() {
    const out: Record<string, string> = {};
    for (const e of this._comps) {
      const line = e.comp.inspect?.call(this as any);
      if (line) out[e.key] = line;
    }
    return out;
  }

  /** @internal Runs `update` on this object and its subtree. */
  _update() {
    if (this.paused || !this._alive) return;
    for (const e of this._comps) {
      e.comp.update?.call(this as any);
      if (!this._alive) return; // destroyed by one of its own components
    }
    this.trigger("update");
    if (!this._alive || this.children.length === 0) return;
    for (const child of this.children.slice()) (child as unknown as GameObjImpl)._update();
  }

  /** @internal Runs `fixedUpdate` on this object and its subtree. */
  _fixedUpdate() {
    if (this.paused || !this._alive) return;
    for (const e of this._comps) {
      e.comp.fixedUpdate?.call(this as any);
      if (!this._alive) return; // destroyed by one of its own components
    }
    this.trigger("fixedUpdate");
    if (!this._alive || this.children.length === 0) return;
    for (const child of this.children.slice()) (child as unknown as GameObjImpl)._fixedUpdate();
  }

  /** @internal Marks the root as part of the tree. */
  _markRoot() {
    this._inTree = true;
  }

  private _attach(child: GameObj) {
    const impl = child as unknown as GameObjImpl;
    impl.parent = this as unknown as GameObj;
    this.children.push(child);
    this.object3d.add(child.object3d);
    if (this._inTree) impl._enter();
  }

  private _enter() {
    if (this._inTree || !this._alive) return;
    this._inTree = true;
    for (const e of this._comps.slice()) {
      if (!this._alive) return;
      e.comp.add?.call(this as any);
    }
    if (!this._alive) return;
    this._ctx.onEnter(this as unknown as GameObj);
    this.trigger("add");
    for (const child of this.children.slice()) (child as unknown as GameObjImpl)._enter();
  }

  private _use(comp: Comp | Tag | object): CompEntry | null {
    if (typeof comp === "string") {
      if (comp === "*") throw new Error(`"*" is reserved and can't be used as a tag.`);
      this.tags.add(comp);
      return null;
    }
    if (comp === null || typeof comp !== "object") {
      throw new Error(`Invalid component: ${String(comp)}. Expected an object or a tag string.`);
    }
    const c = comp as Comp;
    const key = c.id ?? `anonymous#${anonId++}`;
    if (c.id && this.has(c.id)) this._remove(c.id); // replacement: dependents keep working

    const props: string[] = [];
    const descs = Object.getOwnPropertyDescriptors(c);
    for (const prop of Object.keys(descs)) {
      if (LIFECYCLE.has(prop)) continue;
      if (prop in this) {
        const owner = this._comps.find((e) => e.props.includes(prop));
        const by = owner
          ? owner.comp.id
            ? `component "${owner.key}"`
            : "another component without id"
          : "the game object itself";
        const name = c.id ? `Component "${c.id}"` : "A component without id";
        throw new Error(`${name} can't add property "${prop}": it is already defined by ${by}.`);
      }
      Object.defineProperty(this, prop, { ...descs[prop], configurable: true, enumerable: true });
      props.push(prop);
    }
    const entry: CompEntry = { key, comp: c, props };
    this._comps.push(entry);
    return entry;
  }

  private _checkRequire(comp: Comp) {
    for (const req of comp.require ?? []) {
      if (!this.has(req)) {
        throw new Error(`Component "${comp.id}" requires component "${req}". Add ${req}() too.`);
      }
    }
  }
}

/** `true` if `obj` matches the tag query. */
export function matches(obj: GameObj, tag: Tag | Tag[], op: "and" | "or" = "and") {
  if (!Array.isArray(tag)) return obj.is(tag);
  return op === "or" ? tag.some((t) => obj.is(t)) : obj.is(tag);
}
