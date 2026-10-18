import { Quaternion, Vector3 } from "three";
import { definePlugin } from "../../core/engine.js";
import { clamp } from "../../core/math.js";
import type { Engine } from "../../core/types.js";
import { inertPlay, SoundPlay, setXYZ } from "./play.js";
import type { AudioAPI, BeepOpts, PlayOpts } from "./types.js";

export type * from "./types.js";

const _pos = new Vector3();
const _fwd = new Vector3();
const _up = new Vector3();
const _q = new Quaternion();
/** Sample rate of the decoding-only context (most devices run at 48 kHz). */
const OFFLINE_RATE = 48000;

/** Built-in plugin: WebAudio `play`, `loadSound`, `beep` and positional sound. */
export const audioPlugin = definePlugin<AudioAPI>({
  name: "audio",
  install(k: Engine) {
    let ctx: AudioContext | null = null;
    let master: GainNode | null = null;
    let masterVolume = 1;
    let failed = false;
    // After `quit()` no context may be created (a late `play()` would leak one).
    let closed = false;
    // Becomes true after the first user gesture (autoplay policy).
    let unlocked = false;
    /** Decodes sounds before there is a context (see `decoder`). */
    let offline: BaseAudioContext | null = null;
    const sounds = new Map<string, AudioBuffer>();
    const active = new Set<SoundPlay>();

    /** The shared context, created on first use. `null` without WebAudio. */
    function getCtx(): AudioContext | null {
      if (ctx || failed || closed) return ctx;
      const g = globalThis as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = g.AudioContext ?? g.webkitAudioContext;
      if (!Ctor) return null;
      try {
        ctx = new Ctor();
      } catch (err) {
        failed = true;
        console.warn("[threeplay] WebAudio is unavailable:", err);
        return null;
      }
      master = ctx.createGain();
      master.gain.value = masterVolume;
      master.connect(ctx.destination);
      if (unlocked) resume();
      return ctx;
    }

    function resume() {
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    }

    // Browsers keep the context suspended until a user gesture. Touch screens only count the
    // *end* of a tap (`pointerdown`/`touchstart` do not activate the page), so listen to the
    // events that do. The listeners stay until a context is actually running: a gesture before
    // the first `play()` must not use them up.
    const win = typeof window !== "undefined" ? window : null;
    const gestures = ["pointerup", "touchend", "click", "keydown"] as const;
    const stopListening = () => {
      for (const type of gestures) win?.removeEventListener(type, onGesture);
    };
    const onGesture = () => {
      unlocked = true;
      if (!ctx) return; // nothing to resume yet: keep listening
      if (ctx.state === "running") return stopListening();
      ctx.resume().then(
        () => ctx?.state === "running" && stopListening(),
        () => {},
      );
    };
    for (const type of gestures) win?.addEventListener(type, onGesture);

    // The listener (the "ears") follows the camera; positional sounds follow their targets.
    k.hooks.on("afterUpdate", () => {
      if (!ctx) return;
      const cam = k.camera3d;
      cam.updateMatrixWorld();
      cam.getWorldPosition(_pos);
      cam.getWorldDirection(_fwd); // cameras look down -Z
      cam.getWorldQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      setXYZ(ctx.listener, "position", _pos.x, _pos.y, _pos.z);
      setXYZ(ctx.listener, "forward", _fwd.x, _fwd.y, _fwd.z);
      setXYZ(ctx.listener, "up", _up.x, _up.y, _up.z);
      for (const play of active) play.updatePosition();
    });

    k.onQuit(() => {
      closed = true;
      stopListening();
      for (const play of [...active]) play.stop();
      ctx?.close().catch(() => {});
      ctx = null;
      master = null;
      offline = null;
    });

    // Same rule as the assets plugin: absolute URLs are never prefixed.
    const resolve = (url: string) =>
      /^([a-z][a-z0-9+.-]*:|\/)/i.test(url) ? url : (k.loadRoot?.() ?? "") + url;

    /**
     * What decodes the sounds. Loading happens before any gesture, and a real `AudioContext`
     * created then stays suspended and makes browsers warn: use an `OfflineAudioContext`
     * (its buffers play in any context) and only fall back to the real one without it.
     */
    function decoder(): BaseAudioContext | null {
      if (ctx) return ctx;
      if (closed) return null;
      const g = globalThis as unknown as {
        OfflineAudioContext?: typeof OfflineAudioContext;
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      };
      const Offline = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
      if (Offline && !failed) {
        try {
          offline ??= new Offline(1, 1, OFFLINE_RATE);
          return offline;
        } catch {
          // fall through to the real context
        }
      }
      return getCtx();
    }

    function loadSound(name: string, url: string) {
      const task = (async () => {
        if (!decoder()) return null;
        const res = await fetch(resolve(url));
        if (!res.ok)
          throw new Error(`Could not load sound "${name}" from ${url}: HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const c = decoder(); // the engine may have quit while fetching
        if (!c) return null;
        const buffer = await c.decodeAudioData(data);
        sounds.set(name, buffer);
        return buffer;
      })();
      return k.load(task);
    }

    function play(name: string, opts: PlayOpts = {}) {
      const c = getCtx();
      if (!c || !master) return inertPlay(opts);
      const buffer = sounds.get(name);
      if (!buffer) {
        throw new Error(
          `Sound "${name}" is not loaded. Did you call loadSound("${name}", url)? Loaded sounds: ${[...sounds.keys()].join(", ") || "none"}.`,
        );
      }
      resume();
      const handle = new SoundPlay(c, master, buffer, opts, (p) => active.delete(p));
      active.add(handle);
      return handle;
    }

    function beep(opts: BeepOpts = {}) {
      const c = getCtx();
      if (!c || !master) return;
      resume();
      const duration = Math.max(opts.duration ?? 0.1, 0.01);
      const volume = clamp(opts.volume ?? 0.3, 0, 4);
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = opts.type ?? "square";
      osc.frequency.setValueAtTime(opts.freq ?? 440, t);
      if (opts.slideTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(opts.slideTo, 1), t + duration);
      }
      // Short attack and exponential release: no clicks at either end.
      const gain = c.createGain();
      const attack = Math.min(0.005, duration / 2);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(t);
      osc.stop(t + duration + 0.02);
    }

    return {
      get audioCtx() {
        return getCtx();
      },
      loadSound,
      play,
      beep,
      volume(v?: number) {
        if (v !== undefined) {
          masterVolume = Math.max(0, v);
          if (master) master.gain.value = masterVolume;
        }
        return masterVolume;
      },
    };
  },
});
