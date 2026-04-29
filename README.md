# deskbuddy

A browser-based animated AI robot face that serves as a conversational desktop companion. Vanilla HTML, CSS, and JavaScript — no build step, no dependencies to install.

The face listens to you continuously, sends what you say to a local [Ollama](https://ollama.com) server, speaks the reply back with the Web Speech API, and shows one of twelve emotions on a pair of CSS-only eyes. If you enable the webcam, the eyes also follow your face via `face-api.js`.

## Features

- Animated CSS eyes with 12 emotions (neutral, happy, sad, angry, surprised, wink, curious, skeptical, drowsy, sleeping, woke-up, shocked).
- Continuous voice conversation (STT + TTS) tuned for mixed English / Tagalog (`tl-PH`).
- Optional natural voice via [kokoro-js](https://www.npmjs.com/package/kokoro-js), running 100% in-browser (WebGPU when available, WASM fallback). Falls back to the browser's built-in voice if anything goes wrong.
- Local AI inference through Ollama; conversation memory is preserved within a session.
- Optional webcam face tracking with smoothed eye movement and a debug preview.
- Idle personality: wanders and swaps emotions after 1 minute, falls asleep after 3 minutes, reacts with a shocked-then-happy greeting when a face reappears.
- Optional subtitles for the AI's spoken response.

## Requirements

- A Chromium-based browser (Chrome, Edge, Brave). `webkitSpeechRecognition` is not supported in Firefox.
- [Ollama](https://ollama.com) running locally with at least one model pulled (e.g. `ollama pull llama3.2`).
- A webcam (optional, only for face tracking).

## Run it

There is no build step. Serve the folder and open it:

```bash
# pick whichever you already have
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000` in your browser.

### Let the browser talk to Ollama (CORS)

By default Ollama rejects cross-origin requests from a web page. Allow them:

**macOS / Linux / Termux**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**Windows**
Add `OLLAMA_ORIGINS=*` to your System Environment Variables, fully quit Ollama from the system tray, and restart it.

### Optional: natural voice via Kokoro TTS

The app ships with a toggle for **kokoro-js**, a neural TTS that runs entirely in the browser (no server, no Docker, works on Vercel). Flip it on in the settings panel and pick a voice. First-time enable downloads ~90&nbsp;MB of model weights from Hugging Face; the browser caches them for later. WebGPU is used automatically when available (Chrome/Edge), otherwise it falls back to WASM. If anything fails, the app silently reverts to the built-in browser voice — conversations never break.

## Using it

1. Open the page and tap anywhere to wake it. This unlocks audio and, if enabled, the webcam.
2. The settings panel opens on first tap. Set the Ollama URL (default `http://localhost:11434`), hit the refresh icon to load models, and pick one.
3. Close the panel. Speak to the face, or type a message in the test prompt field.
4. Toggle face tracking, the camera debug preview, or subtitles from the settings panel. Clear conversation memory from the same panel.
5. Press the ⛶ button in the top right to go fullscreen.

## Project layout

```
.
├── index.html      # Page shell, settings overlay, hidden video, debug canvas
├── script.js       # All behavior (state, UI, AI, TTS/STT, vision, idle, greeting)
├── style.css       # Styling, CSS-only eye emotions, settings UI
└── .kiro/steering/ # AI assistant guidance for this repo
```

No backend, no bundler, no `package.json`, no tests.

## License

See [LICENSE](./LICENSE).
