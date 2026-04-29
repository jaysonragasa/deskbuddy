---
inclusion: fileMatch
fileMatchPattern: 'script.js'
---

# Ollama Integration

All AI inference happens through a user-configured Ollama HTTP server. This document is the source of truth for how `script.js` talks to it — match these shapes exactly when changing anything in this area.

## Endpoints used

- `GET  {ollamaUrl}/api/tags` — list installed models. Called from `fetchModels()`. Expected shape: `{ models: [{ name: string, ... }, ...] }`.
- `POST {ollamaUrl}/api/generate` — single-turn completion with token-level context memory. Called from `handlePrompt(promptText)`.

No other Ollama endpoints (`/api/chat`, `/api/embeddings`, etc.) are used. Do not introduce a new endpoint without a real need — the existing flow depends on `generate`'s `context` token array for memory, which `/api/chat` handles differently.

## Configuration

- `ollamaUrl` — read from `localStorage.getItem('ollamaUrl')`, default `http://localhost:11434`. Persisted on every call to `fetchModels()` via `localStorage.setItem('ollamaUrl', url)`.
- `selectedModel` — read from `localStorage.getItem('selectedModel')`. Persisted whenever the model `<select>` changes or after a successful `fetchModels()`.
- The UI inputs that own these values are `#ollama-url` and `#ollama-model`. `handlePrompt` always re-reads both from the DOM before building a request so users can change them between turns.

## Request shape for `/api/generate`

```js
const payload = {
    model: selectedModel,
    prompt: promptText,
    system: systemPrompt, // see below
    stream: false         // non-streaming; the whole reply is parsed at once
};
if (conversationContext.length > 0) {
    payload.context = conversationContext; // token array from the previous response
}
```

Rules:
- Keep `stream: false`. The TTS + emotion-tag parsing in `handlePrompt` assumes the full text is available synchronously. Streaming would require rewriting the response handler, the subtitles update, and the talking-head animation trigger.
- Always forward `conversationContext` when it is non-empty. Always update it from `data.context` in the response (Ollama returns a new token array per turn).
- `conversationContext` must be cleared when: the user clicks **Clear Conversation Memory** (`#btn-clear-memory`), or models are (re)fetched in `fetchModels()`. Switching models with stale context from a different model causes bad completions.

## System prompt contract

The system prompt enforces an **emotion tag protocol** that drives the face:

> Every response MUST begin with exactly one tag from the allowed set: `[neutral]`, `[happy]`, `[sad]`, `[angry]`, `[surprised]`, `[wink]`, `[curious]`, `[skeptical]`, `[drowsy]`, `[sleeping]`, `[woke up]`, `[shocked]`.

Parsing, in `handlePrompt`:
1. Regex `/\[(neutral|happy|sad|angry|surprised|wink|curious|skeptical|drowsy|sleeping|woke up|shocked)\]/i` extracts the tag.
2. The matched name is lowercased and `" "` is replaced with `"-"` (so `[woke up]` becomes the CSS class token `woke-up`).
3. `/\[.*?\]/gi` strips **all** bracketed tags from the text before it is passed to `speakText` and subtitles — do not let brackets leak into TTS.

When you add, rename, or remove an emotion you **must** update all four places or the contract breaks:
- the `systemPrompt` string in `handlePrompt`,
- the regex alternation in the tag-extraction step,
- the `IDLE_ALIVE_EMOTIONS` array (if the emotion should appear during idle-alive),
- the corresponding `.emotion-<name>` block in `style.css` and the `data-emotion="<name>"` button in `index.html`.

See `.kiro/steering/emotions.md` for the full emotion catalog and the `<tag> → CSS class` mapping.

## Error handling

- Network or parse failure in `fetchModels`: populate the `<select>` with a placeholder (`No models found` / `Failed to connect`), set `statusText` and dim `statusIndicator`, and **do not throw**.
- Network failure in `handlePrompt`: set emotion to `sad`, speak the fallback line `"Pasensya na, hindi ako maka connect sa server."`, reset to `neutral`, and always `resumeListening()` in `finally`. Preserve this fallback text — it matches the Tagalog-friendly persona of the app.
- Never surface raw `Error` objects to the user via `statusText`. Log details with `console.error` / `console.warn`, show a short human message.

## Listening loop interaction

`handlePrompt` stops speech recognition before calling the API and calls `resumeListening()` in `finally`. Any new code path that talks to Ollama must preserve this pattern, otherwise the microphone will pick up the TTS output and create a feedback loop.

## CORS (user-side setup)

The browser will block requests to `http://localhost:11434` unless Ollama is started with permissive origins:

- macOS / Linux / Termux: `OLLAMA_ORIGINS="*" ollama serve`
- Windows: set `OLLAMA_ORIGINS=*` as a System Environment Variable, quit Ollama from the tray, restart it.

The settings panel in `index.html` already explains this in the help text next to the URL field. If that instruction text is changed, keep it consistent with this steering file.

## When adding new features

- A new Ollama-driven behavior (e.g. summarization, tool calls) should reuse `handlePrompt`'s flow: build a payload, include context, parse the emotion tag, strip brackets, speak, update context. Don't bypass the tag protocol — the face needs it.
- If you genuinely need streaming, add it as an alternate path gated by a settings toggle rather than changing the default. Preserve the non-streaming path for the talking-head animation.
- Do not send conversation history or prompts anywhere other than the user-configured Ollama URL. This project has no other network egress by design.
