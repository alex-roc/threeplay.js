import type { GameObj } from "../../core/types.js";
import type { Vec3Like } from "../transform/types.js";

/** Options of `play()`. */
export interface PlayOpts {
  /** Gain 0–1 (default 1). */
  volume?: number;
  /** Repeat until stopped. */
  loop?: boolean;
  /** Playback rate (default 1). */
  speed?: number;
  /** Detune in cents. */
  detune?: number;
  /**
   * Positional sound at a point or following an object (attenuates with
   * distance to the camera, pans with its orientation). A vector is read
   * every frame, so mutating it moves the sound. When the object is destroyed
   * a one-shot sound finishes where it was, but a `loop` sound **stops** with it.
   */
  at?: Vec3Like | GameObj;
  /** Spatialization model for positional sounds (default `"HRTF"`; `"equalpower"` is cheaper). */
  panning?: "HRTF" | "equalpower";
  /** Distance at which a positional sound starts to attenuate (default 1). */
  refDistance?: number;
  /** How fast a positional sound fades with distance (inverse model, default 1). */
  rolloff?: number;
}

/** A playing sound. */
export interface AudioPlay {
  /** Pauses and resumes the sound, keeping its position. */
  paused: boolean;
  /** Gain 0–1. */
  volume: number;
  /** Playback rate. */
  speed: number;
  /** Stops the sound for good (also resolves {@link AudioPlay.ended}). */
  stop(): void;
  /** Resolves when the sound ends or is stopped (a loop only resolves when stopped). */
  readonly ended: Promise<void>;
}

/** Options of `beep()`. */
export interface BeepOpts {
  /** Hz (default 440). */
  freq?: number;
  /** Seconds (default 0.1). */
  duration?: number;
  /** Oscillator wave (default `"square"`). */
  type?: OscillatorType;
  /** Gain 0–1 (default 0.3). */
  volume?: number;
  /** Slide to this frequency by the end. */
  slideTo?: number;
}

/**
 * API of the audio plugin (WebAudio). Without WebAudio (Node, old browsers)
 * everything is inert: `play()` returns a handle that ends at once.
 *
 * Sounds keep playing across scenes unless you `stop()` them (the exception: looping
 * sounds attached to an object with `at` stop when that object is destroyed, e.g. by `go()`).
 * After `quit()` no new AudioContext is created.
 */
export interface AudioAPI {
  /** The shared AudioContext, created on first use (`null` when unavailable, e.g. in Node). */
  readonly audioCtx: AudioContext | null;
  /**
   * Loads and decodes a sound under a name (the first scene waits for it). Resolves `null`
   * without audio. Decoding uses an `OfflineAudioContext` when available, so no real
   * AudioContext is created before the first `play()`/`beep()`/`audioCtx` access.
   */
  loadSound(name: string, url: string): Promise<AudioBuffer | null>;
  /** Plays a loaded sound. Throws (listing the loaded names) for an unknown name. */
  play(name: string, opts?: PlayOpts): AudioPlay;
  /** A synthesized blip: no assets needed (UI, prototypes, coins). */
  beep(opts?: BeepOpts): void;
  /** Master volume 0–1 (get or set). */
  volume(v?: number): number;
}

declare module "../../core/types.js" {
  interface PluginRegistry {
    audio: AudioAPI;
  }
}
