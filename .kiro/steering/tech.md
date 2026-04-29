# Tech Stack

## Stack

- **Language**: Vanilla JavaScript (ES2017+), no transpilation.
- **Markup / styling**: Plain HTML5 and hand-written CSS3 with CSS custom properties (`:root` variables).
- **No framework**: No React/Vue/etc. No bundler, no npm, no `package.json`.
- **Module style**: Single global script (`script.js`) loaded via `<script src>`. No ES modules, no imports.

## Runtime dependencies (CDN only)

- **face-api.js** `@0.22.2` via `cdn.jsdelivr.net` — face detection.
- **face-api.js model weights** loaded from `cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights` (only the `tinyFaceDetector` net is used).
- **Google Fonts** — `Outfit` font family.
- **Ollama HTTP API** at a user-configured URL (default `http://localhost:11434`), endpoints `/api/tags` and `/api/generate`.

## Browser APIs used

- `SpeechRecognition` / `webkitSpeechRecognition` (continuous mode, `lang = 'tl-PH'`).
- `SpeechSynthesis` / `SpeechSynthesisUtterance` (prefers a `tl` or `PH` voice when available).
- `navigator.mediaDevices.getUserMedia` for the front camera (`320x240`).
- `localStorage` for all settings persistence (`ollamaUrl`, `selectedModel`, `showSubtitles`, `visionEnabled`, `visionDebug`).
- `requestAnimationFrame` for the face-follow render loop.
- `Fullscreen API`.

## Conventions

- Use `const` / `let`; prefer `const` for values that are not reassigned.
- Top-level state is kept as module-level `let` variables at the top of `script.js`. Keep new state there and group it with a short comment.
- Tunable constants are `UPPER_SNAKE_CASE` (e.g. `FACE_SMOOTHING`, `IDLE_SLEEP_AFTER_MS`) and live near related logic.
- DOM lookups are cached once into module-level constants (`wrapper`, `mainContainer`, etc.) and reused.
- Guard every new DOM-dependent block with an existence check (`if (el) { ... }`) to match existing defensive style.
- Emotions are applied by setting `wrapper.className = 'eyes-wrapper emotion-<name>'`. Any new emotion needs a matching `.emotion-<name>` rule in `style.css`.
- When adding features that animate `wrapper.style.transform`, respect the existing priority: speaking animation and greeting > face tracking > idle-alive wander > random movements. Check `isSystemSpeaking`, `isGreeting`, `faceTarget.active`, `isIdleAlive` before writing a transform.
- Use `async`/`await` with `try/catch` for network and media calls. Swallow non-fatal errors with `console.debug` / `console.warn`; surface user-facing failures through `statusText` and `statusIndicator`.
- Persist any user-facing toggle to `localStorage` immediately in its `change` handler.

## Common commands

There is no build system. Everything runs by opening the page in a browser.

```bash
# Serve locally (pick one you have installed)
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000` in a Chromium-based browser (recommended for `webkitSpeechRecognition`).

Ollama must be reachable with CORS allowed:

```bash
# macOS / Linux / Termux
OLLAMA_ORIGINS="*" ollama serve
```

On Windows, set `OLLAMA_ORIGINS=*` as a System Environment Variable and restart Ollama from the tray.

There are no tests, no linter config, and no formatter config in the repo. Match the existing style rather than introducing new tooling unless asked.
