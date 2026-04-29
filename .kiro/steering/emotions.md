---
inclusion: fileMatch
fileMatchPattern: 'style.css|script.js|index.html'
---

# Emotions

Emotions are the central visual vocabulary of the app. Every emotion is a string that simultaneously names:

1. A CSS class on `.eyes-wrapper` (e.g. `emotion-happy`) — defined in `style.css`.
2. A `data-emotion` attribute on a preset button in `index.html`.
3. A value passed to `setEmotion(name)` in `script.js`.
4. A bracketed tag `[name]` that Ollama prepends to every reply (see `ollama.md`).

If any of these four fall out of sync the face will misbehave silently. Treat the emotion set as a cross-file contract.

## Catalog

All 12 supported emotions, with CSS class, AI tag, and what they look/feel like:

| Emotion    | CSS class              | AI tag         | Visual effect                                                                                                      |
|------------|------------------------|----------------|--------------------------------------------------------------------------------------------------------------------|
| neutral    | `emotion-neutral`      | `[neutral]`    | Default open eyes, lids fully retracted. The "resting" state returned to after most interactions.                  |
| happy      | `emotion-happy`        | `[happy]`      | Bottom lids rise into a smile arc; eyes shorten and get rounded bottom corners.                                    |
| sad        | `emotion-sad`          | `[sad]`        | Top lids tilt inward (↖↗ rotation); eyes become taller.                                                            |
| angry      | `emotion-angry`        | `[angry]`      | Top lids slant down toward the center; eyes turn red (`#ff3333`) and the wrapper glow shifts to red.               |
| surprised  | `emotion-surprised`    | `[surprised]`  | Eyes grow wider and taller with larger border radius.                                                              |
| wink       | `emotion-wink`         | `[wink]`       | Left eye compresses to a slit (`scaleY(0.1)`), right eye stays open.                                               |
| curious    | `emotion-curious`      | `[curious]`    | Asymmetric: left eye taller, right eye shorter and squeezed; whole wrapper tilts 8°.                               |
| skeptical  | `emotion-skeptical`    | `[skeptical]`  | Lids close in from top and bottom with a slight rotation; eyes become shorter. Right top lid gets an extra tilt.   |
| drowsy     | `emotion-drowsy`       | `[drowsy]`     | Lids close heavily from top and bottom with rounded shapes; eyes shrink vertically.                                |
| sleeping   | `emotion-sleeping`     | `[sleeping]`   | Eyes dim to 40% opacity and collapse to a flat line (`scaleY(0.08)`). Animated floating `Zzz` appears via `::after`. |
| woke-up    | `emotion-woke-up`      | `[woke up]`    | Eyes enlarge and shake with the `jitter` keyframe animation.                                                       |
| shocked    | `emotion-shocked`      | `[shocked]`    | Eyes turn white with an inner cyan glow, become tall and narrow.                                                   |

## Tag → CSS class mapping

The AI returns tags like `[woke up]` (with a space). `handlePrompt` normalizes them:

```js
emotion = emoMatch[1].toLowerCase().replace(' ', '-');
// "[Woke Up]" -> "woke up" -> "woke-up" -> class "emotion-woke-up"
```

Only `[woke up]` currently contains a space. If you add a multi-word emotion, make sure the normalization still produces the exact CSS class token you defined in `style.css` (use `-` in the class, space in the tag).

## Applying an emotion

Always go through `setEmotion(name)`:

```js
function setEmotion(emotion) {
    wrapper.className = `eyes-wrapper emotion-${emotion}`;
    // adds a small pop/bounce unless currently speaking
}
```

Do not set `wrapper.className` or `wrapper.classList` manually from elsewhere — `setEmotion` is the single entry point and also handles the pop animation. Do not append emotion classes additively; `emotion-*` classes are **mutually exclusive**.

## State-driven emotions

Certain emotions are driven by application state, not by the AI:

- **`sleeping`** — set by `goToSleep()` after `IDLE_SLEEP_AFTER_MS` (3 min) of inactivity. Accompanied by `isSleeping = true`.
- **`woke-up`** — set by `resetIdleTimer()` when activity resumes while `isSleeping` is true. A `"Hey there!"` line is spoken, then the face returns to `neutral`.
- **`shocked` → `happy`** — the greeting sequence in `triggerGreeting()` when a face reappears after `FACE_ABSENCE_FOR_GREET_MS` (5 s) with a `FACE_GREETING_COOLDOWN_MS` cooldown (20 s).
- **`sad`** — set by `handlePrompt`'s error branch when the Ollama request fails.
- **Random idle emotions** — `startIdleAlive()` picks from `IDLE_ALIVE_EMOTIONS` every `IDLE_ALIVE_EMOTION_MS` (15 s).

`IDLE_ALIVE_EMOTIONS` currently contains: `happy`, `curious`, `skeptical`, `surprised`, `drowsy`, `wink`, `neutral`, `sad`. `sleeping`, `woke-up`, `shocked`, and `angry` are intentionally excluded — they are reserved for specific events. Keep this separation when adding new emotions: decide whether it's an *event* emotion, an *idle* emotion, or both.

## Transform priority

Several systems animate `wrapper.style.transform`. Emotion changes via `setEmotion` also briefly set a transform. The priority, highest first, is:

1. `isSystemSpeaking` — `speakText` drives a talking nod.
2. `isGreeting` — `triggerGreeting` owns the transform for its duration.
3. `faceTarget.active` — face-tracking render loop in `startFaceFollowRender`.
4. `isIdleAlive` — wandering motion in `startIdleAlive`.
5. Background random movement in `startRandomMovements`.
6. The one-shot pop inside `setEmotion`.

Any new code that writes to `wrapper.style.transform` must respect this order: check the higher-priority flags before writing.

## Adding a new emotion

Complete checklist — all steps are required, or the face will silently fail:

1. **CSS** — Add a `.emotion-<name> { ... }` block (and optional sub-selectors for `.left-eye`, `.right-eye`, `.top-lid`, `.bottom-lid`, or `::after`) in the "Eye Emotions" section of `style.css`. Reuse `:root` color variables.
2. **HTML** — Add a preset button `<button class="btn btn-sm" data-emotion="<name>">Label</button>` to the Emotion Testing Presets group in `index.html` for manual testing.
3. **System prompt** — Append `[<tag>]` to the allowed list in the `systemPrompt` template string inside `handlePrompt`.
4. **Regex** — Add `<tag>` to the alternation in the emotion-extraction regex inside `handlePrompt`. If the tag contains a space, verify the `.toLowerCase().replace(' ', '-')` normalization yields your CSS class name.
5. **Idle set** — If this emotion should appear during idle-alive wandering, add it to `IDLE_ALIVE_EMOTIONS`. Otherwise leave it out.
6. **Catalog** — Add a row to the table above in this file.

## Removing or renaming an emotion

Do all of the following in one change:

- Delete or rename the `.emotion-<name>` rule(s) in `style.css`.
- Delete or update the matching `data-emotion` button in `index.html`.
- Remove or update the tag in the `systemPrompt` and the extraction regex in `script.js`.
- Remove it from `IDLE_ALIVE_EMOTIONS` if present.
- Audit any hardcoded callers: `goToSleep` (`'sleeping'`), `resetIdleTimer` (`'woke-up'`, `'neutral'`), `triggerGreeting` (`'shocked'`, `'happy'`, `'neutral'`), `handlePrompt` error branch (`'sad'`, `'neutral'`), and the idle-alive picker. Any reference to the removed name must be migrated.
- Update the catalog in this file.
