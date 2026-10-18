import type { GameObj } from "../../core/types";
import type { Vec3Like } from "../transform/types";

export interface PlayOpts {
  volume?: number;
  loop?: boolean;
  /** Playback rate (default 1). */
  speed?: number;
  /** Detune in cents. */
  detune?: number;
  /** Positional sound at a point or following an object (attenuates with distance to the camera). */
  at?: Vec3Like | GameObj;
}

/** A playing sound. */
export interface AudioPlay {
  paused: boolean;
  volume: number;
  speed: number;
  stop(): void;
  /** Resolves when the sound ends (never for loops). */
  readonly ended: Promise<void>;
}

export interface BeepOpts {
  /** Hz (default 440). */
  freq?: number;
  /** Seconds (default 0.1). */
  duration?: number;
  type?: OscillatorType;
  volume?: number;
  /** Slide to this frequency by the end. */
  slideTo?: number;
}

/** API of the audio plugin (WebAudio). */
export interface AudioAPI {
  /** The shared AudioContext (`null` when unavailable, e.g. in Node). */
  readonly audioCtx: AudioContext | null;
  loadSound(name: string, url: string): Promise<AudioBuffer | null>;
  /** Plays a loaded sound. */
  play(name: string, opts?: PlayOpts): AudioPlay;
  /** A synthesized blip: no assets needed (UI, prototypes, coins). */
  beep(opts?: BeepOpts): void;
  /** Master volume 0–1 (get or set). */
  volume(v?: number): number;
}

declare module "../../core/types" {
  interface PluginRegistry {
    audio: AudioAPI;
  }
}
