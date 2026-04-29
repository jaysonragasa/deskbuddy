# Product

**Deskbuddy** is a browser-based animated AI robot face that serves as a conversational desktop companion. It renders expressive CSS-only eyes that react to the user through voice, vision, and emotion.

## Core capabilities

- **Animated face**: Pure CSS eyes with multiple emotions (neutral, happy, sad, angry, surprised, wink, curious, skeptical, drowsy, sleeping, woke-up, shocked).
- **Voice conversation**: Listens continuously via Web Speech API (speech-to-text), sends prompts to a local Ollama server, and replies via Web Speech Synthesis (text-to-speech).
- **Emotion tagging**: The AI prepends one emotion tag (e.g. `[happy]`) to each response, which drives the face's visual state.
- **Face tracking**: Optional webcam-based face detection (face-api.js) so the eyes follow the user.
- **Idle personality**: After periods of inactivity the face enters an "alive" idle mode with random wandering and emotion changes, eventually falling asleep.
- **Greeting behavior**: Reacts with a shocked-then-happy greeting when a face reappears after an absence.
- **Conversation memory**: Keeps Ollama `context` tokens across turns within a session; settings UI can clear it.

## Target runtime

- Runs entirely client-side in a modern browser.
- Requires a local Ollama server reachable from the browser (CORS must allow it, e.g. `OLLAMA_ORIGINS="*"`).
- Designed to work in mixed English / Tagalog (`tl-PH`) speech contexts.

## Non-goals

- No backend, no build pipeline, no package manager.
- No user accounts, no cloud inference, no telemetry.
