import type { EventController } from "./types";

type Handler = (...args: any[]) => void;

interface Entry {
  fn: Handler;
  ctrl: EventController;
}

/**
 * A list of handlers for one event. Handlers added or cancelled while the
 * event is being emitted take effect on the next emit.
 */
export class HandlerList {
  private entries: Entry[] = [];

  add(fn: Handler): EventController {
    const entry: Entry = {
      fn,
      ctrl: {
        paused: false,
        cancel: () => {
          const i = this.entries.indexOf(entry);
          if (i >= 0) this.entries.splice(i, 1);
        },
      },
    };
    this.entries.push(entry);
    return entry.ctrl;
  }

  emit(...args: unknown[]) {
    if (this.entries.length === 0) return;
    for (const e of this.entries.slice()) {
      if (!e.ctrl.paused) e.fn(...args);
    }
  }

  get size() {
    return this.entries.length;
  }

  clear() {
    this.entries.length = 0;
  }
}

/** Named events, each with its own {@link HandlerList}. */
export class EventEmitter {
  private lists = new Map<string, HandlerList>();

  on(event: string, fn: Handler): EventController {
    let list = this.lists.get(event);
    if (!list) {
      list = new HandlerList();
      this.lists.set(event, list);
    }
    return list.add(fn);
  }

  emit(event: string, ...args: unknown[]) {
    this.lists.get(event)?.emit(...args);
  }

  has(event: string) {
    return (this.lists.get(event)?.size ?? 0) > 0;
  }

  clear() {
    this.lists.clear();
  }
}

/**
 * Collects controllers so they can all be cancelled at once. The engine keeps
 * one scope for "global" listeners and one per running scene.
 */
export class Scope {
  private ctrls: EventController[] = [];

  track<C extends EventController>(ctrl: C): C {
    this.ctrls.push(ctrl);
    return ctrl;
  }

  dispose() {
    for (const c of this.ctrls) c.cancel();
    this.ctrls.length = 0;
  }
}

/** Combines several controllers into one. */
export function joinControllers(ctrls: EventController[]): EventController {
  return {
    get paused() {
      return ctrls.every((c) => c.paused);
    },
    set paused(p: boolean) {
      for (const c of ctrls) c.paused = p;
    },
    cancel() {
      for (const c of ctrls) c.cancel();
    },
  };
}
