import { clamp } from "../../core/math";
import { isGameObj, targetPos } from "../../core/util";
import type { AudioPlay, PlayOpts } from "./types";

/** Sets a (possibly legacy) AudioParam-or-method triple, e.g. a panner's position. */
export function setXYZ(
  node: PannerNode | AudioListener,
  prop: "position" | "forward" | "up",
  x: number,
  y: number,
  z: number,
) {
  const px = (node as unknown as Record<string, AudioParam | undefined>)[`${prop}X`];
  if (px) {
    px.value = x;
    (node as unknown as Record<string, AudioParam>)[`${prop}Y`].value = y;
    (node as unknown as Record<string, AudioParam>)[`${prop}Z`].value = z;
  } else if (prop === "position") {
    // Old Safari: no AudioParams.
    (node as PannerNode).setPosition(x, y, z);
  }
}

/** An inert handle, for environments without WebAudio. Its `ended` resolves at once. */
export function inertPlay(opts: PlayOpts = {}): AudioPlay {
  let paused = false;
  let volume = opts.volume ?? 1;
  let speed = opts.speed ?? 1;
  return {
    get paused() {
      return paused;
    },
    set paused(p) {
      paused = p;
    },
    get volume() {
      return volume;
    },
    set volume(v) {
      volume = v;
    },
    get speed() {
      return speed;
    },
    set speed(s) {
      speed = s;
    },
    stop() {},
    ended: Promise.resolve(),
  };
}

/**
 * One playing sound: buffer source → gain → (panner) → master.
 * Pausing stops the source and remembers the position; resuming starts a new
 * source at that offset (an AudioBufferSourceNode can only start once).
 */
export class SoundPlay implements AudioPlay {
  readonly ended: Promise<void>;
  /** Present for positional sounds. */
  readonly panner: PannerNode | null = null;

  private readonly gain: GainNode;
  private readonly at: PlayOpts["at"];
  private readonly loop: boolean;
  private readonly detune: number;
  private source: AudioBufferSourceNode | null = null;
  private isPaused = false;
  private done = false;
  private rate: number;
  /** Position in the buffer (seconds) as of `startedAt`. */
  private offset = 0;
  private startedAt = 0;
  private lastPos = { x: 0, y: 0, z: 0 };
  private resolveEnded!: () => void;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly buffer: AudioBuffer,
    opts: PlayOpts,
    private readonly onDone: (play: SoundPlay) => void,
  ) {
    this.ended = new Promise((res) => {
      this.resolveEnded = res;
    });
    this.loop = opts.loop ?? false;
    this.rate = opts.speed ?? 1;
    this.detune = opts.detune ?? 0;
    this.at = opts.at;

    this.gain = ctx.createGain();
    this.gain.gain.value = clamp(opts.volume ?? 1, 0, 4);
    if (opts.at) {
      const panner = ctx.createPanner();
      panner.panningModel = opts.panning ?? "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = opts.refDistance ?? 1;
      panner.rolloffFactor = opts.rolloff ?? 1;
      this.panner = panner;
      this.gain.connect(panner);
      panner.connect(destination);
      this.updatePosition();
    } else {
      this.gain.connect(destination);
    }
    this.start();
  }

  get paused() {
    return this.isPaused;
  }

  set paused(p: boolean) {
    if (p === this.isPaused || this.done) return;
    this.isPaused = p;
    if (p) {
      this.commit();
      this.detach();
    } else {
      this.start();
    }
  }

  get volume() {
    return this.gain.gain.value;
  }

  set volume(v: number) {
    this.gain.gain.value = clamp(v, 0, 4);
  }

  get speed() {
    return this.rate;
  }

  set speed(s: number) {
    if (!this.isPaused && !this.done) this.commit();
    this.rate = s;
    if (this.source) this.source.playbackRate.value = s;
  }

  stop() {
    if (this.done) return;
    this.detach();
    this.finish();
  }

  /**
   * Moves a positional sound to where its target is now. Called every frame.
   * A destroyed object leaves a one-shot sound where it was, but ends a looping one
   * (a loop would play forever from a place that no longer exists).
   */
  updatePosition() {
    if (!this.panner || !this.at) return;
    if (!isGameObj(this.at) || this.at.exists()) {
      const p = targetPos(this.at);
      this.lastPos = { x: p.x, y: p.y, z: p.z };
    } else if (this.loop) {
      this.stop();
      return;
    }
    setXYZ(this.panner, "position", this.lastPos.x, this.lastPos.y, this.lastPos.z);
  }

  private start() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.playbackRate.value = this.rate;
    src.detune.value = this.detune;
    src.connect(this.gain);
    src.onended = () => {
      if (this.source === src) this.finish();
    };
    this.source = src;
    this.startedAt = this.ctx.currentTime;
    const dur = this.buffer.duration;
    src.start(0, this.loop && dur > 0 ? this.offset % dur : this.offset);
  }

  /** Folds the time played since `startedAt` into `offset`. */
  private commit() {
    const now = this.ctx.currentTime;
    this.offset += (now - this.startedAt) * this.rate;
    this.startedAt = now;
  }

  private detach() {
    const src = this.source;
    if (!src) return;
    this.source = null;
    src.onended = null;
    try {
      src.stop();
    } catch {
      // already stopped
    }
    src.disconnect();
  }

  private finish() {
    this.done = true;
    this.source = null;
    this.gain.disconnect();
    this.panner?.disconnect();
    this.onDone(this);
    this.resolveEnded();
  }
}
