import { EventEmitter } from "../../core/events";
import { self } from "../../core/util";
import type { StateComp } from "./types";

/** Builds the `state()` component: a small finite state machine. */
export function createState(initial: string, allowed?: string[]): StateComp {
  const events = new EventEmitter();
  let cur = initial;
  // The initial state is entered on the first frame, so handlers registered
  // right after `add([...])` still see it (same as kaplay).
  let started = false;

  const check = (name: string) => {
    if (allowed && !allowed.includes(name)) {
      throw new Error(`State "${name}" is not allowed. Allowed states: ${allowed.join(", ")}.`);
    }
  };
  check(initial);

  return {
    id: "state",
    get state() {
      return cur;
    },
    set state(name: string) {
      self(this).enterState(name);
    },
    enterState(name: string, ...args: unknown[]) {
      check(name);
      // Entering a state before the first frame replaces the initial one
      // silently: it was never entered, so it has nothing to end.
      if (started) events.emit(`end:${cur}`);
      started = true;
      cur = name;
      events.emit(`enter:${name}`, ...args);
    },
    onStateEnter(name: string, fn: (...args: any[]) => void) {
      return events.on(`enter:${name}`, fn);
    },
    onStateEnd(name: string, fn: () => void) {
      return events.on(`end:${name}`, fn);
    },
    onStateUpdate(name: string, fn: () => void) {
      return events.on(`update:${name}`, fn);
    },
    update() {
      if (!started) {
        started = true;
        events.emit(`enter:${cur}`);
      }
      events.emit(`update:${cur}`);
    },
    inspect() {
      return cur;
    },
  };
}
