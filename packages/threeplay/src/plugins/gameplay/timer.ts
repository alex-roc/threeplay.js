import { type Easing, easings, lerpValue } from "../../core/math.js";
import type { TimerController, Tweenable } from "../../core/types.js";
import type { TimerComp } from "./types.js";

interface Entry {
  /** Advances the timer; `true` once it has finished. */
  tick(dt: number): boolean;
}

/**
 * Builds the `timer()` component. Timers tick in the object's own `update`
 * (so `obj.paused` stops them) and are dropped when the object is destroyed.
 * `dtOf` is `k.dt`.
 */
export function createTimer(dtOf: () => number): TimerComp {
  let entries: Entry[] = [];

  function start(tick: (dt: number) => boolean): TimerController {
    let finished = false;
    const done: Array<() => void> = [];
    const entry: Entry = {
      tick(dt) {
        if (ctrl.paused || !tick(dt)) return false;
        finished = true;
        for (const fn of done) fn();
        return true;
      },
    };
    const ctrl: TimerController = {
      paused: false,
      cancel() {
        entries = entries.filter((e) => e !== entry);
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
    entries.push(entry);
    return ctrl;
  }

  return {
    id: "timer",
    wait(seconds: number, fn?: () => void) {
      let t = 0;
      return start((dt) => {
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
      return start((dt) => {
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
      set: (v: V) => void,
      easing: Easing = easings.linear,
    ) {
      let t = 0;
      set(lerpValue(from, to, 0));
      return start((dt) => {
        t += dt;
        const p = duration <= 0 ? 1 : Math.min(t / duration, 1);
        set(lerpValue(from, to, easing(p)));
        return p >= 1;
      });
    },
    update() {
      const dt = dtOf();
      for (const entry of entries.slice()) {
        if (entry.tick(dt)) entries = entries.filter((e) => e !== entry);
      }
    },
    destroy() {
      entries = [];
    },
  };
}
