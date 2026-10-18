import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../core/engine";
import type { Engine } from "../../core/types";
import { renderPlugin } from "../render";
import { transformPlugin } from "../transform";
import { audioPlugin } from ".";

// --- a minimal WebAudio fake: just enough to observe what the plugin does ---

const param = (value = 0) => ({
  value,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});
const xyz = (prefix: string) =>
  Object.fromEntries(["X", "Y", "Z"].map((a) => [`${prefix}${a}`, param()]));

class FakeNode {
  connected: FakeNode[] = [];
  connect(n: FakeNode) {
    this.connected.push(n);
  }
  disconnect() {
    this.connected = [];
  }
}
class FakeGain extends FakeNode {
  gain = param(1);
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = param(1);
  detune = param(0);
  onended: (() => void) | null = null;
  started: Array<[number, number]> = [];
  stopped = 0;
  start(when: number, offset: number) {
    this.started.push([when, offset]);
  }
  stop() {
    this.stopped++;
  }
}
class FakePanner extends FakeNode {
  panningModel = "";
  distanceModel = "";
  refDistance = 0;
  rolloffFactor = 0;
  [key: string]: unknown;
  constructor() {
    super();
    Object.assign(this, xyz("position"));
  }
}
class FakeOsc extends FakeNode {
  type = "";
  frequency = param(440);
  onended: (() => void) | null = null;
  started: number | null = null;
  stoppedAt: number | null = null;
  start(t: number) {
    this.started = t;
  }
  stop(t: number) {
    this.stoppedAt = t;
  }
}

let created: FakeCtx[] = [];
class FakeCtx {
  currentTime = 0;
  state = "suspended";
  destination = new FakeNode();
  listener = { ...xyz("position"), ...xyz("forward"), ...xyz("up") };
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  panners: FakePanner[] = [];
  oscs: FakeOsc[] = [];
  closed = false;
  constructor() {
    created.push(this);
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createPanner() {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createOscillator() {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  decodeAudioData(_: ArrayBuffer) {
    return Promise.resolve({ duration: 2 });
  }
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

const g = globalThis as Record<string, unknown>;

const make = () =>
  createEngine({ loop: "manual", renderer: "none" }, [
    renderPlugin,
    transformPlugin,
    audioPlugin,
  ]) as Engine;

const loaded = async (k: Engine, name = "boom") => {
  vi.stubGlobal("fetch", async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  await k.loadSound(name, "boom.ogg");
};

const ctxOf = () => created[0];

beforeEach(() => {
  created = [];
  g.AudioContext = FakeCtx;
});
afterEach(() => {
  delete g.AudioContext;
  delete g.window;
  vi.unstubAllGlobals();
});

describe("audio without WebAudio (Node)", () => {
  beforeEach(() => {
    delete g.AudioContext;
  });

  it("is inert: no context, loadSound resolves null, play ends at once", async () => {
    const k = make();
    expect(k.audioCtx).toBeNull();
    expect(await k.loadSound("x", "x.ogg")).toBeNull();
    const p = k.play("x", { volume: 0.5, speed: 2 });
    expect(p.volume).toBe(0.5);
    expect(p.speed).toBe(2);
    p.paused = true;
    expect(p.paused).toBe(true);
    await p.ended;
    k.beep();
    k.step(0.016);
    expect(k.volume()).toBe(1);
    expect(k.volume(0.3)).toBe(0.3);
  });
});

describe("audio context", () => {
  it("is created lazily and shared", () => {
    const k = make();
    expect(created.length).toBe(0);
    const c = k.audioCtx;
    expect(c).toBe(ctxOf());
    expect(k.audioCtx).toBe(c);
    expect(created.length).toBe(1);
  });

  it("resumes on the first user gesture", () => {
    const win = new EventTarget();
    g.window = win;
    const k = make();
    k.audioCtx; // create it, still suspended
    expect(ctxOf().resume).not.toHaveBeenCalled();
    win.dispatchEvent(new Event("keydown"));
    expect(ctxOf().resume).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("pointerdown")); // listeners are gone
    expect(ctxOf().resume).toHaveBeenCalledTimes(1);
  });

  it("master volume reaches the master gain, even when set before the context exists", () => {
    const k = make();
    k.volume(0.25);
    k.audioCtx;
    expect(ctxOf().gains[0].gain.value).toBe(0.25);
    k.volume(0.5);
    expect(ctxOf().gains[0].gain.value).toBe(0.5);
  });

  it("closes the context on quit", () => {
    const k = make();
    k.audioCtx;
    k.quit();
    expect(ctxOf().closed).toBe(true);
  });
});

describe("loadSound / play", () => {
  it("decodes into a named buffer; unknown names list the loaded ones", async () => {
    const k = make();
    await loaded(k);
    expect(() => k.play("nope")).toThrow(/not loaded.*loadSound\("nope".*boom/);
    expect(() => k.play("boom")).not.toThrow();
  });

  it("applies volume, loop, speed and detune", async () => {
    const k = make();
    await loaded(k);
    const p = k.play("boom", { volume: 0.4, loop: true, speed: 1.5, detune: 100 });
    const src = ctxOf().sources[0];
    expect(src.loop).toBe(true);
    expect(src.playbackRate.value).toBe(1.5);
    expect(src.detune.value).toBe(100);
    expect(src.started).toEqual([[0, 0]]);
    expect(p.volume).toBe(0.4);
    p.volume = 0.8;
    expect(p.volume).toBe(0.8);
    p.speed = 2;
    expect(src.playbackRate.value).toBe(2);
  });

  it("pause keeps the position and resume restarts from it", async () => {
    const k = make();
    await loaded(k);
    const p = k.play("boom", { speed: 2 });
    ctxOf().currentTime = 0.25; // 0.5 s into the buffer at speed 2
    p.paused = true;
    expect(ctxOf().sources[0].stopped).toBe(1);
    ctxOf().currentTime = 5;
    p.paused = false;
    expect(ctxOf().sources[1].started).toEqual([[0, 0.5]]);
  });

  it("stop resolves `ended` and a natural end does too", async () => {
    const k = make();
    await loaded(k);
    const a = k.play("boom");
    a.stop();
    await a.ended;
    const b = k.play("boom");
    ctxOf().sources[1].onended?.();
    await b.ended;
  });

  it("pausing does not count as ending", async () => {
    const k = make();
    await loaded(k);
    const p = k.play("boom");
    const src = ctxOf().sources[0];
    let ended = false;
    p.ended.then(() => {
      ended = true;
    });
    p.paused = true;
    src.onended?.(); // ignored: the source was detached
    await Promise.resolve();
    expect(ended).toBe(false);
  });
});

describe("positional sound", () => {
  it("a panner follows the object each frame; the listener follows the camera", async () => {
    const k = make();
    await loaded(k);
    const o = k.add([k.pos(1, 2, 3)]);
    k.play("boom", { at: o, panning: "equalpower", refDistance: 2, rolloff: 3 });
    const panner = ctxOf().panners[0];
    expect(panner.panningModel).toBe("equalpower");
    expect(panner.distanceModel).toBe("inverse");
    expect(panner.refDistance).toBe(2);
    expect(panner.rolloffFactor).toBe(3);
    expect((panner.positionX as { value: number }).value).toBe(1);
    o.pos.set(7, 8, 9);
    k.camera3d.position.set(0, 0, 10);
    k.camera3d.lookAt(0, 0, 0);
    k.step(0.016);
    expect((panner.positionX as { value: number }).value).toBe(7);
    expect((panner.positionZ as { value: number }).value).toBe(9);
    const l = ctxOf().listener;
    expect(l.positionZ.value).toBeCloseTo(10);
    expect(l.forwardZ.value).toBeCloseTo(-1);
    expect(l.upY.value).toBeCloseTo(1);
  });

  it("vectors are read every frame; destroyed objects leave the sound in place", async () => {
    const k = make();
    await loaded(k);
    const v = k.vec3(1, 0, 0);
    k.play("boom", { at: v });
    const o = k.add([k.pos(5, 0, 0)]);
    k.play("boom", { at: o });
    k.audioCtx;
    v.x = 4;
    k.step(0.016);
    const [pv, po] = ctxOf().panners;
    expect((pv.positionX as { value: number }).value).toBe(4);
    o.destroy();
    k.step(0.016);
    expect((po.positionX as { value: number }).value).toBe(5);
  });

  it("stopped sounds are no longer updated", async () => {
    const k = make();
    await loaded(k);
    const v = k.vec3(1, 0, 0);
    const p = k.play("boom", { at: v });
    p.stop();
    v.x = 9;
    k.step(0.016);
    expect((ctxOf().panners[0].positionX as { value: number }).value).toBe(1);
  });
});

describe("beep", () => {
  it("schedules an enveloped oscillator", () => {
    const k = make();
    k.beep({ freq: 880, duration: 0.2, type: "sine", volume: 0.5, slideTo: 220 });
    const osc = ctxOf().oscs[0];
    expect(osc.type).toBe("sine");
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(220, 0.2);
    expect(osc.started).toBe(0);
    expect(osc.stoppedAt).toBeCloseTo(0.22);
    const env = ctxOf().gains[1].gain; // gains[0] is the master
    expect(env.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, expect.any(Number));
    expect(env.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 0.2);
  });

  it("uses sensible defaults", () => {
    const k = make();
    k.beep();
    const osc = ctxOf().oscs[0];
    expect(osc.type).toBe("square");
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
    expect(osc.frequency.exponentialRampToValueAtTime).not.toHaveBeenCalled();
  });
});
