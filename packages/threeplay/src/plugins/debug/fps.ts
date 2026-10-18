/**
 * Frames-per-second meter, smoothed with an exponential moving average.
 * Feed it real time (`performance.now()`), not the game's scaled `dt`, so the
 * number stays honest while the game is paused or slowed down.
 */
export class FpsMeter {
  private last: number | null = null;
  private fps = 0;

  /** @param smoothing weight of each new sample, 0–1 (default 0.1). */
  constructor(private readonly smoothing = 0.1) {}

  /** Registers a frame at `nowMs`; returns the real seconds since the previous one (0 on the first). */
  tick(nowMs: number): number {
    const prev = this.last;
    this.last = nowMs;
    if (prev === null) return 0;
    const dt = (nowMs - prev) / 1000;
    if (dt <= 0) return 0;
    const sample = 1 / dt;
    this.fps = this.fps === 0 ? sample : this.fps + (sample - this.fps) * this.smoothing;
    return dt;
  }

  /** Smoothed frames per second (0 before the second frame). */
  get value() {
    return this.fps;
  }
}
