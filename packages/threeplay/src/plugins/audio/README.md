# audio

WebAudio sounds, positional audio and synthesized beeps. No dependencies.

One `AudioContext` is created lazily on first use (`null` in Node or without WebAudio, in which
case everything is inert). It is resumed on the first `pointerdown`/`keydown` on `window`, to
satisfy browser autoplay policies. All sounds go through a master `GainNode`.

## API

- `loadSound(name, url)` — fetch + `decodeAudioData` inside `k.load()` (resolves `null` without
  audio). Relative URLs use the assets plugin's `loadRoot()` when it is installed.
- `play(name, opts)` — returns an `AudioPlay` handle: `paused`, `volume`, `speed`, `stop()`,
  `ended` (a promise; resolves on natural end or `stop()`, never for an unstopped loop).
  Options: `volume`, `loop`, `speed`, `detune` (cents), `at`, `panning` (`"HRTF"` default or
  `"equalpower"`), `refDistance`, `rolloff`. Throws for an unknown name, listing the loaded ones.
- `at` (a vector or a game object) makes the sound positional: a `PannerNode` with inverse
  distance falloff whose position is refreshed every frame. A vector is read every frame; a
  destroyed object leaves the sound where it was. The listener follows `k.camera3d`
  (position and orientation) in `afterUpdate`.
- `beep({ freq = 440, duration = 0.1, type = "square", volume = 0.3, slideTo })` — an oscillator
  with a short envelope. No assets needed: great for prototypes and UI.
- `volume(v?)` — master volume (get or set; may be set before the context exists).
- `audioCtx` — the shared context (escape hatch).

Sounds are **not** stopped when the scene changes: they keep playing until they end or you
`stop()` them (e.g. in `onSceneLeave`).

## Example

```js
loadSound("boom", "boom.ogg");

scene("main", () => {
  const bomb = add([pos(5, 0, 0), sphere(0.4)]);
  onKeyPress("space", () => play("boom", { at: bomb, volume: 0.8 }));
  onClick(() => beep({ freq: 880, slideTo: 440, duration: 0.15 }));
  const music = play("theme", { loop: true, volume: 0.4 });
  onSceneLeave(() => music.stop());
});
```
