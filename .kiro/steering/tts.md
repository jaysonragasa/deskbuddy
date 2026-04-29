---
inclusion: fileMatch
fileMatchPattern: 'script.js'
---

# Text-to-Speech

The app supports two speech engines. `speakText(text)` is the single entry point used everywhere else in the codebase; it picks an engine per call and owns the full talking-head lifecycle.

## Engines

1. **kokoro-js** (preferred when enabled). In-browser neural TTS, loaded lazily via dynamic `import()` from jsDelivr. Runs on WebGPU when `navigator.gpu` exists, else WASM. Model: `onnx-community/Kokoro-82M-v1.0-ONNX`, `dtype: "q8"`.
2. **Web Speech Synthesis** (`window.speechSynthesis`). Always available as a fallback. The original voice used in the app.

Both engines reuse `startTalkingAnimation()` / `stopTalkingAnimation()` so the talking-head nod, `isSystemSpeaking`, transform reset, and `resetIdleTimer()` behave identically regardless of which engine rendered the audio.

## Selection rule

```js
if (kokoroEnabled) -> try Kokoro first, catch any rejection and fall back to Web Speech
else               -> Web Speech
```

The Kokoro branch is wrapped in `.catch(() => speakWithWebSpeech(text))`. A failing Kokoro call (CDN import failure, model download error, runtime error, audio playback failure, browser without WebGPU *and* no WASM support) **must never** break a conversation turn. The fallback path is silent except for a `console.warn` with the error message.

## `speakText` contract

Every engine implementation must:

1. Set `isSystemSpeaking = true` **before** any audio starts. Other systems (idle-alive, random movements, speech recognition, face tracking) read this flag to yield.
2. Drive the talking-head animation for the duration of the audio via `startTalkingAnimation()` / `stopTalkingAnimation(handle)`. Do not re-implement the interval.
3. On end **and** on error: clear the interval, unset `isSystemSpeaking`, reset `wrapper.style.transform`, and call `resetIdleTimer()`. `stopTalkingAnimation` does all four.
4. Return a `Promise<void>` that resolves (not rejects) from the caller's perspective. Rejections inside the Kokoro path are caught by `speakText` and trigger the Web Speech fallback; every other caller of `speakText` does `await speakText(...)` and expects a resolved promise.
5. Never throw synchronously. All errors go through the promise chain.

## Kokoro loading

- Module is imported **lazily** via `await import(KOKORO_MODULE_URL)` on first need. Users who never toggle Kokoro on don't pay the download cost.
- The resulting `KokoroTTS` instance is cached in `kokoroTTS`. A concurrent `kokoroLoadPromise` protects against races so two quick turns don't trigger two loads.
- Warm-up: `DOMContentLoaded` calls `loadKokoroTTS()` if `kokoroEnabled` is already true, and the toggle's `change` handler kicks it off when a user flips it on. Both warm-up paths swallow errors with `console.warn`.
- Progress is surfaced via `statusText` (e.g. `Downloading voice model... 42%`) using `transformers.js`'s `progress_callback`. The status is cleared back to the previous message once the model is ready.
- **Device is pinned to `"wasm"`**. kokoro-js's own README requires `dtype: "fp32"` to use WebGPU correctly; with `dtype: "q8"` on WebGPU, ORT substitutes fallback kernels for unsupported int8 ops and produces speech-shaped garbage ("alien babble"). Do not change this without also changing dtype.

## ORT threading (`env.wasm.proxy`)

Before `KokoroTTS.from_pretrained` runs, `loadKokoroTTS` imports `@huggingface/transformers` as a sibling module and flips two flags on its ORT env:

- `env.backends.onnx.wasm.proxy = true` — moves the entire ORT runtime into a Web Worker. Without this, `tts.generate()` blocks the main thread for the full duration of inference (1–3 seconds per sentence on a laptop), which freezes every CSS animation, the idle timer, the blink interval, and face tracking.
- `env.backends.onnx.wasm.numThreads` — set to `min(hardwareConcurrency, 4)` when `crossOriginIsolated` is true, else `1`. Multi-thread WASM requires `SharedArrayBuffer`, which requires the page to be served with COOP/COEP headers (see `vercel.json`).

These flags **must be set before the first inference session is created**. Setting them after `from_pretrained` has no effect.

The sibling transformers.js import reuses the same version that kokoro-js depends on (`^3.5.1`). The browser's module cache de-dupes the request, so there's no second download.

## Kokoro generation

```js
const audio = await tts.generate(text, {
    voice: kokoroVoice,  // e.g. "af_heart"
    speed: kokoroSpeed   // 0.5..1.5, user-configurable
});
const blob = audio.toBlob(); // RawAudio -> WAV Blob
```

Play via an `HTMLAudioElement`:

- Wrap the blob in `URL.createObjectURL` and feed `new Audio(url)`.
- Keep exactly one `kokoroAudio` at a time; pause and discard any previous element before starting a new one so overlapping turns don't double up.
- Always `URL.revokeObjectURL` in the cleanup path (both `onended` and `onerror`) to avoid a slow memory leak on long sessions.

Do not switch to the streaming `tts.stream(...)` generator without rewriting `startTalkingAnimation` to hook the chunk lifecycle — the current animation ties to the whole-clip `onended` event.

## Voice list

`KokoroTTS` exposes its voices as an object on `tts.voices`. `populateKokoroVoices()` reads that after load and fills the `#kokoro-voice` `<select>`. If the saved `kokoroVoice` isn't in the voice set, default to the first id and persist.

Do not hard-code the full voice list in markup — it can change with the model version. The select falls back to a placeholder until the model loads.

## Persisted settings

| Key              | Type    | Default    | Notes                                           |
|------------------|---------|------------|-------------------------------------------------|
| `kokoroEnabled`  | boolean | `false`    | Written as `"true"`/`"false"`.                  |
| `kokoroVoice`    | string  | `af_heart` | Must match a voice id the model exposes.        |
| `kokoroSpeed`    | number  | `1.0`      | Clamped via UI to `0.5..1.5`.                   |

Follow the same `localStorage` pattern as other settings: persist on every `change` / `input` event, re-read the live values from module-level `let` vars inside `speakWithKokoro` so runtime edits take effect without a reload.

## Script-tag requirements

`script.js` is loaded as a classic script (not `type="module"`). Dynamic `import()` still works from classic scripts in every modern browser, so the current setup is fine. Do not convert `script.js` to a module just for TTS — it would break every other `document.getElementById` timing assumption in the file and violate the "single global script, no imports at top level" convention in `.kiro/steering/tech.md`.

## When adding new TTS behavior

- New knobs (e.g. pitch, language code) → add the control to the Kokoro settings block in `index.html`, wire a `localStorage` read/write in the settings block of `script.js`, and thread the value through `speakWithKokoro`'s `tts.generate` call. Web Speech can ignore the knob.
- Alternate engines → follow the shape of `speakWithKokoro` / `speakWithWebSpeech` (return a promise, use `startTalkingAnimation` / `stopTalkingAnimation`) and slot selection into `speakText`'s if-chain. Preserve the fallback order: new engine → Kokoro → Web Speech.
- Do not remove the Web Speech fallback. It is the only engine guaranteed to work with no network, no WebGPU, no model download — it's the safety net that keeps the app working when Kokoro can't load.
