# Project Structure

## Layout

```
.
├── index.html      # Single page: face, settings overlay, hidden video, debug canvas
├── script.js       # All behavior (state, UI wiring, AI, TTS/STT, vision, idle, greeting)
├── style.css       # All styling, including CSS-only eye emotions and settings UI
├── README.md       # Minimal project name
├── LICENSE
└── .kiro/
    └── steering/   # AI assistant guidance (this folder)
```

Flat, three-file project. There are no subfolders for source, no assets folder, and no build output.

## File responsibilities

### `index.html`
- Declares the root containers: `#main-container`, `#eyes-wrapper` (with `.left-eye` / `.right-eye`, each containing `.top-lid` and `.bottom-lid`), `#tap-overlay`, `#subtitles-container`, `#vision-video`, `#vision-debug` (canvas + label), and the `#settings-overlay` panel.
- Loads `face-api.js` from CDN and the local `style.css` / `script.js`.
- All interactive controls use stable `id`s (`ollama-url`, `ollama-model`, `btn-fetch-models`, `btn-send-test`, `toggle-subtitles`, `toggle-vision`, `toggle-vision-debug`, `btn-clear-memory`, `btn-close-settings`, `btn-fullscreen`, `status-text`, `status-indicator`). Emotion preset buttons use `data-emotion="<name>"`. Preserve these IDs and attributes — `script.js` selects them directly.

### `script.js`
Organized top-to-bottom roughly as:
1. **State** — module-level `let` vars and `UPPER_SNAKE_CASE` tuning constants, grouped by concern (vision, idle, greeting).
2. **Idle behavior** — `clearIdleTimers`, `startIdleAlive`, `stopIdleAlive`, `goToSleep`, `resetIdleTimer` and the global `mousemove` / `keydown` listeners that feed it.
3. **DOM element cache** — one block of `document.getElementById` calls.
4. **Settings wiring** — reads `localStorage`, sets checkbox/input initial values, attaches `change` handlers that persist back.
5. **Bootstrap** — `DOMContentLoaded` starts blinking, random movements, idle timers, and fetches models if a URL is known.
6. **UI shell** — fullscreen button, wake tap handler, settings open/close.
7. **Ollama integration** — `fetchModels`, `handlePrompt` (builds the system prompt, parses the `[emotion]` tag, calls `speakText`, manages subtitles and status).
8. **Face animation primitives** — `setEmotion`, `triggerBlink`, `startRandomBlinking`, `startRandomMovements`.
9. **TTS** — `speakText` (also drives talking-head nod animation).
10. **STT** — `initSpeechRecognition`, `resumeListening`.
11. **Vision** — `loadVisionModels`, `initVision`, `stopVision`, `startVisionLoop`, `drawVisionDebug`, `startFaceFollowRender`.
12. **Greeting** — `GREETINGS` list, `triggerGreeting`, `wait` helper.

Keep this ordering when adding features: place new state at the top, new helpers near the section that owns them, and new DOM wiring in the settings block.

### `style.css`
Organized as:
1. `:root` tokens (`--bg-color`, `--eye-color`, `--eye-glow`, `--panel-bg`, `--panel-border`, `--text-primary`, `--text-secondary`). Reuse these variables instead of hardcoding colors.
2. Base layout (`body`, `.main-container`, `.tap-overlay`).
3. Eyes geometry (`.eyes-wrapper`, `.eye`, `.eye-lid`, `.top-lid`, `.bottom-lid`).
4. Emotion rules, one block per emotion (`.emotion-neutral`, `.emotion-happy`, …, `.emotion-shocked`, `.emotion-woke-up`). New emotions belong here and must match a string used in `script.js` (`setEmotion(...)` or the `data-emotion` attribute).
5. Animations (`@keyframes blinkAnim`, `zzzAnim`, `jitter`, `pulse`, `fadeIn`).
6. Settings overlay and controls.
7. Subtitles, toggle switch, floating button, vision debug preview.

## Cross-file contracts

- **Emotion names** are the shared vocabulary between `script.js` (`setEmotion`, `IDLE_ALIVE_EMOTIONS`, AI system prompt, `data-emotion` buttons) and `style.css` (`.emotion-<name>`). Keep these in sync when adding, renaming, or removing an emotion.
- **DOM IDs and `data-emotion` values** are the contract between `index.html` and `script.js`. Don't rename one without the other.
- **CSS variables** defined in `:root` are the color contract; prefer them in new styles.

## Adding new functionality

- New settings toggle → add the control to the settings panel in `index.html`, read/initialize/persist it in the settings-wiring block of `script.js`, and reuse the `.toggle-switch` / `.setting-row` classes.
- New emotion → add a `.emotion-<name>` rule in `style.css`, optionally add it to `IDLE_ALIVE_EMOTIONS`, and make sure the AI system prompt in `handlePrompt` lists it so Ollama can pick it.
- New background behavior (animations, idle variants) → route through `setEmotion` and the existing transform-priority checks; do not attach independent `setInterval` transforms to `wrapper` without guarding against the active states.
