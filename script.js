let isAudioInitialized = false;
let recognition;
let isSystemSpeaking = false;
let ollamaUrl = localStorage.getItem('ollamaUrl') || 'http://localhost:11434';
let selectedModel = localStorage.getItem('selectedModel') || '';
let showSubtitles = localStorage.getItem('showSubtitles') === 'true';
let visionEnabled = localStorage.getItem('visionEnabled') === 'true';
let visionDebug = localStorage.getItem('visionDebug') === 'true';
let conversationContext = []; // Stores token history of conversation
let idleTimeout = null;
let isSleeping = false;

// Vision / face-tracking state
let visionInitialized = false;
let visionStream = null;
let visionLoopHandle = null;
let visionModelsLoaded = false;
let faceTarget = { x: 0, y: 0, active: false };
let faceSmoothed = { x: 0, y: 0 };
const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const FACE_MAX_OFFSET_X = 140; // px, how far the eyes can drift horizontally
const FACE_MAX_OFFSET_Y = 90;  // px, vertically
const FACE_INPUT_GAIN = 2.2;   // amplify small head movements before clamping
const FACE_RESPONSE_POWER = 0.7; // <1 makes small moves more visible (ease-out curve)
const FACE_SMOOTHING = 0.22;   // 0..1, higher = snappier

// Greeting behavior: trigger when a face appears after being absent long enough
const FACE_GREETING_COOLDOWN_MS = 20000; // minimum time between greetings
const FACE_ABSENCE_FOR_GREET_MS = 5000;  // face must be absent this long to re-greet
let lastFaceSeenAt = 0;
let lastGreetingAt = 0;
let isGreeting = false;

function resetIdleTimer() {
    if (isSleeping) {
        isSleeping = false;
        setEmotion('woke-up');
        speakText("Hey there!").then(() => {
            if (wrapper.className.includes('emotion-woke-up')) {
                setEmotion('neutral');
            }
        });
    }

    clearTimeout(idleTimeout);
    if (!isSystemSpeaking) {
        idleTimeout = setTimeout(() => {
            isSleeping = true;
            setEmotion('sleeping');
        }, 60000); // 1 minute
    }
}

window.addEventListener('mousemove', resetIdleTimer);
window.addEventListener('keydown', resetIdleTimer);

// DOM Elements
const wrapper = document.getElementById('eyes-wrapper');
const mainContainer = document.getElementById('main-container');
const settingsOverlay = document.getElementById('settings-overlay');
const tapOverlay = document.getElementById('tap-overlay');
const statusText = document.getElementById('status-text');
const statusIndicator = document.getElementById('status-indicator');
const visionVideo = document.getElementById('vision-video');
const visionDebugEl = document.getElementById('vision-debug');
const visionDebugCanvas = document.getElementById('vision-debug-canvas');
const visionDebugLabel = document.getElementById('vision-debug-label');
const visionDebugCtx = visionDebugCanvas ? visionDebugCanvas.getContext('2d') : null;

// Init form
document.getElementById('ollama-url').value = ollamaUrl;
const toggleSubtitles = document.getElementById('toggle-subtitles');
if (toggleSubtitles) {
    toggleSubtitles.checked = showSubtitles;
    toggleSubtitles.addEventListener('change', (e) => {
        showSubtitles = e.target.checked;
        localStorage.setItem('showSubtitles', showSubtitles);
    });
}
const btnClearMemory = document.getElementById('btn-clear-memory');
if (btnClearMemory) {
    btnClearMemory.addEventListener('click', () => {
        conversationContext = [];
        const statusTxt = document.getElementById('status-text');
        if (statusTxt) statusTxt.innerText = 'Memory wiped!';
        setTimeout(() => { if (statusTxt) statusTxt.innerText = 'Listening for voice...'; }, 2000);
    });
}

const toggleVision = document.getElementById('toggle-vision');
if (toggleVision) {
    toggleVision.checked = visionEnabled;
    toggleVision.addEventListener('change', async (e) => {
        visionEnabled = e.target.checked;
        localStorage.setItem('visionEnabled', visionEnabled);
        if (visionEnabled) {
            await initVision();
        } else {
            stopVision();
        }
    });
}

const toggleVisionDebug = document.getElementById('toggle-vision-debug');
if (toggleVisionDebug) {
    toggleVisionDebug.checked = visionDebug;
    applyVisionDebugVisibility();
    toggleVisionDebug.addEventListener('change', (e) => {
        visionDebug = e.target.checked;
        localStorage.setItem('visionDebug', visionDebug);
        applyVisionDebugVisibility();
    });
}

function applyVisionDebugVisibility() {
    if (!visionDebugEl) return;
    if (visionDebug && visionInitialized) {
        visionDebugEl.classList.add('visible');
    } else {
        visionDebugEl.classList.remove('visible');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    startRandomBlinking();
    startRandomMovements();
    if (ollamaUrl) fetchModels();
});

const btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
    btnFullscreen.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent Settings from opening
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            btnFullscreen.innerHTML = '⛶';
        } else {
            btnFullscreen.innerHTML = '✖';
        }
    });
}

// Wake Interaction
mainContainer.addEventListener('click', () => {
    // If not initialized, initialize audio on first interaction
    if (!isAudioInitialized) {
        initSpeechRecognition();
        isAudioInitialized = true;
    }

    // If vision was enabled previously, start it on the same gesture (browsers
    // require a user gesture for getUserMedia on some platforms).
    if (visionEnabled && !visionInitialized) {
        initVision();
    }

    // Hide tap hint
    if (tapOverlay) tapOverlay.style.opacity = '0';

    // Open settings only if we tapped the container directly
    openSettings();
});

function openSettings() {
    settingsOverlay.classList.add('visible');
}

function closeSettings() {
    settingsOverlay.classList.remove('visible');
}

document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
});

// Ollama Fetch Models
async function fetchModels() {
    const url = document.getElementById('ollama-url').value.trim();
    localStorage.setItem('ollamaUrl', url);
    const select = document.getElementById('ollama-model');

    try {
        statusText.innerText = "Fetching models...";
        statusIndicator.className = 'status-indicator processing';

        const res = await fetch(`${url}/api/tags`);
        const data = await res.json();

        select.innerHTML = '';
        if (data.models && data.models.length > 0) {
            data.models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                opt.textContent = m.name;
                if (m.name === selectedModel) opt.selected = true;
                select.appendChild(opt);
            });
            statusText.innerText = "Models loaded";
            statusIndicator.className = 'status-indicator listening';
            selectedModel = select.value;
            localStorage.setItem('selectedModel', selectedModel);
            conversationContext = []; // Clear memory when fetching/changing models
        } else {
            select.innerHTML = '<option value="">No models found</option>';
            statusText.innerText = "No models available";
            statusIndicator.className = 'status-indicator';
        }
    } catch (err) {
        console.error(err);
        select.innerHTML = '<option value="">Failed to connect</option>';
        statusText.innerText = "Connection failed";
        statusIndicator.className = 'status-indicator';
    }
}

document.getElementById('btn-fetch-models').addEventListener('click', fetchModels);
document.getElementById('ollama-model').addEventListener('change', (e) => {
    selectedModel = e.target.value;
    localStorage.setItem('selectedModel', selectedModel);
});

// Emotion Management
function setEmotion(emotion) {
    wrapper.className = `eyes-wrapper emotion-${emotion}`;
    
    // Provide a small pop/bounce when emotion changes
    if (!isSystemSpeaking) {
        wrapper.style.transform = `scale(1.1) translateY(-15px)`;
        setTimeout(() => {
            if (!isSystemSpeaking) {
                wrapper.style.transform = `scale(1) translateY(0px) rotate(0deg)`;
            }
        }, 250);
    }
}

document.querySelectorAll('[data-emotion]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const emo = e.target.getAttribute('data-emotion');
        setEmotion(emo);
        // Reset after a delay for manual preset tests
        setTimeout(() => setEmotion('neutral'), 4000);
    });
});

function triggerBlink() {
    const eyes = document.querySelectorAll('.eye');
    eyes.forEach(e => e.classList.add('blink'));
    setTimeout(() => {
        eyes.forEach(e => e.classList.remove('blink'));
    }, 300);
}

function startRandomBlinking() {
    setInterval(() => {
        // Only blink organically over time
        if (Math.random() > 0.4) triggerBlink();
    }, 4500);
}

function startRandomMovements() {
    setInterval(() => {
        if (isSystemSpeaking) return; // Don't interfere with talking nod
        if (faceTarget.active) return; // Don't interfere with face tracking

        // 60% chance to look around gracefully
        if (Math.random() > 0.4) {
            const x = (Math.random() - 0.5) * 60; // -30px to 30px
            const y = (Math.random() - 0.5) * 40; // -20px to 20px

            let transformStr = `translate(${x}px, ${y}px)`;

            // 30% chance to tilt slightly (curious look)
            if (Math.random() > 0.7) {
                const angle = (Math.random() - 0.5) * 15; // -7.5 to 7.5 deg
                transformStr += ` rotate(${angle}deg)`;
            }

            wrapper.style.transform = transformStr;

            // Return to center after a random time
            setTimeout(() => {
                if (!isSystemSpeaking && !faceTarget.active) {
                    wrapper.style.transform = `translate(0px, 0px) rotate(0deg)`;
                }
            }, 1500 + Math.random() * 1500);
        }
    }, 4000);
}

// AI Chat Interaction
document.getElementById('btn-send-test').addEventListener('click', async () => {
    const text = document.getElementById('test-message').value;
    if (text) {
        await handlePrompt(text);
        document.getElementById('test-message').value = '';
    }
});

async function handlePrompt(promptText) {
    if (isSystemSpeaking) return;

    // Stop listening temporarily to avoid feedback loops
    if (recognition) {
        try { recognition.stop(); } catch (e) { }
    }

    const url = document.getElementById('ollama-url').value.trim();
    selectedModel = document.getElementById('ollama-model').value;

    if (!selectedModel) {
        statusText.innerText = 'Error: Please select a model first.';
        statusIndicator.className = 'status-indicator';
        return;
    }

    statusText.innerText = 'AI is Thinking...';
    statusIndicator.className = 'status-indicator processing';
    setEmotion('neutral');

    // Core system prompt enforcing emotion tags for the user requirement
    const systemPrompt = `You are a standalone animated AI face interface.
Always communicate conversationally, warmly, and naturally.
Respond natively in English if you are spoken to in English.
CRITICAL RULE: You MUST begin EVERY response with exactly ONE of the following tags that best matches your emotion: [neutral], [happy], [sad], [angry], [surprised], [wink], [curious], [skeptical], [drowsy], [sleeping], [woke up], [shocked].
Do not include any other markdown or tags. Keep answers short and concise.`;

    try {
        const payload = {
            model: selectedModel,
            prompt: promptText,
            system: systemPrompt,
            stream: false
        };
        
        // Inject conversational history memory
        if (conversationContext.length > 0) {
            payload.context = conversationContext;
        }

        const response = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        let aiText = data.response || '';
        
        // Save conversational history to memory
        if (data.context) {
            conversationContext = data.context;
        }
        
        // Extract Emotion match
        let emotion = 'neutral';
        const emoMatch = aiText.match(/\[(neutral|happy|sad|angry|surprised|wink|curious|skeptical|drowsy|sleeping|woke up|shocked)\]/i);
        if (emoMatch) {
            emotion = emoMatch[1].toLowerCase().replace(' ', '-');
        }

        // Remove tag for TTS reading
        const cleanText = aiText.replace(/\[.*?\]/gi, '').trim();

        // Output interaction
        setEmotion(emotion);
        
        const subtitlesContainer = document.getElementById('subtitles-container');
        if (showSubtitles && subtitlesContainer) {
            document.getElementById('subtitles-text').innerText = cleanText;
            subtitlesContainer.classList.add('visible');
            subtitlesContainer.scrollTop = 0;
        }
        
        await speakText(cleanText);
        
        if (subtitlesContainer) {
            setTimeout(() => subtitlesContainer.classList.remove('visible'), 3000);
        }
        
        // Return to neutral after speaking
        setEmotion('neutral');

    } catch (err) {
        console.error("AI Fetch Error:", err);
        setEmotion('sad');
        statusText.innerText = 'AI Connection error';
        statusIndicator.className = 'status-indicator';
        await speakText('Pasensya na, hindi ako maka connect sa server.');
        setEmotion('neutral');
    } finally {
        resumeListening();
    }
}

// Text to Speech
function speakText(text) {
    return new Promise((resolve) => {
        if (!text) { resolve(); return; }

        isSystemSpeaking = true;
        const utterance = new SpeechSynthesisUtterance(text);

        const voices = window.speechSynthesis.getVoices();
        // Give preference to language/region if available
        const tlVoice = voices.find(v => v.lang.includes('tl') || v.lang.includes('PH'));
        if (tlVoice) {
            utterance.voice = tlVoice;
        }

        // Animate lips/eyes slightly while speaking
        let nodUp = false;
        const talkingInterval = setInterval(() => {
            nodUp = !nodUp;
            const y = nodUp ? -12 : 8;
            const angle = (Math.random() - 0.5) * 6; // Slight head wobble
            wrapper.style.transform = `translate(0px, ${y}px) rotate(${angle}deg)`;
            
            if (Math.random() > 0.7) triggerBlink();
        }, 400);

        utterance.onend = () => {
            clearInterval(talkingInterval);
            isSystemSpeaking = false;
            wrapper.style.transform = `translate(0px, 0px) rotate(0deg)`;
            resetIdleTimer();
            resolve();
        };
        utterance.onerror = () => {
            clearInterval(talkingInterval);
            isSystemSpeaking = false;
            wrapper.style.transform = `translate(0px, 0px) rotate(0deg)`;
            resetIdleTimer();
            resolve();
        };

        window.speechSynthesis.speak(utterance);
    });
}
window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// Speech to Text (Continuous Listening)
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        statusText.innerText = 'Speech Recognition NOT Supported in this browser';
        statusIndicator.className = 'status-indicator';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'tl-PH'; // Natively catches Tagalog/English mix perfectly
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
        if (!isSystemSpeaking) {
            statusText.innerText = 'Listening for voice...';
            statusIndicator.className = 'status-indicator listening';
        }
    };

    recognition.onresult = async (event) => {
        if (isSystemSpeaking) return; // Prevent mic feedback loop
        
        resetIdleTimer();

        const last = event.resultIndex;
        const transcript = event.results[last][0].transcript.trim();

        if (transcript) {
            statusText.innerText = `Heard: "${transcript}"`;
            await handlePrompt(transcript);
        }
    };

    recognition.onerror = (e) => {
        if (e.error === 'not-allowed') {
            statusText.innerText = 'Microphone access denied';
            statusIndicator.className = 'status-indicator';
        } else if (e.error === 'network') {
            statusText.innerText = 'Network error during recognition';
            statusIndicator.className = 'status-indicator';
        } else {
            console.warn('Speech error:', e.error);
        }
    };

    recognition.onend = () => {
        // Continuous auto-restart loop unless we intentionally stopped to speak
        if (!isSystemSpeaking) {
            setTimeout(() => {
                try { recognition.start(); } catch (e) { }
            }, 1000);
        }
    };

    resumeListening();
}

function resumeListening() {
    statusText.innerText = 'Listening for voice...';
    statusIndicator.className = 'status-indicator listening';
    if (recognition && !isSystemSpeaking) {
        setTimeout(() => {
            try { recognition.start(); } catch (e) { }
        }, 500);
    }
}

// ============================================================
// Vision / Face Tracking (face-api.js)
// ============================================================
async function loadVisionModels() {
    if (visionModelsLoaded) return true;
    if (typeof faceapi === 'undefined') {
        console.warn('face-api.js not loaded');
        return false;
    }
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
        visionModelsLoaded = true;
        console.log('face-api tiny detector loaded from', FACE_API_MODEL_URL);
        return true;
    } catch (err) {
        console.error('Failed to load face-api model from', FACE_API_MODEL_URL, err);
        return false;
    }
}

async function initVision() {
    if (visionInitialized) return;

    const prevStatus = statusText.innerText;
    statusText.innerText = 'Loading vision model...';
    statusIndicator.className = 'status-indicator processing';

    const ok = await loadVisionModels();
    if (!ok) {
        statusText.innerText = 'Vision model failed to load';
        statusIndicator.className = 'status-indicator';
        return;
    }

    try {
        visionStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, facingMode: 'user' },
            audio: false
        });
        visionVideo.srcObject = visionStream;
        await new Promise((resolve) => {
            if (visionVideo.readyState >= 2) return resolve();
            visionVideo.onloadedmetadata = () => resolve();
        });
        await visionVideo.play().catch(() => {});
    } catch (err) {
        console.error('Camera access failed:', err);
        statusText.innerText = 'Camera access denied';
        statusIndicator.className = 'status-indicator';
        visionEnabled = false;
        localStorage.setItem('visionEnabled', false);
        if (toggleVision) toggleVision.checked = false;
        return;
    }

    visionInitialized = true;
    statusText.innerText = prevStatus || 'Listening for voice...';
    statusIndicator.className = 'status-indicator listening';

    // Size the debug canvas to match the video's native resolution
    if (visionDebugCanvas) {
        visionDebugCanvas.width = visionVideo.videoWidth || 320;
        visionDebugCanvas.height = visionVideo.videoHeight || 240;
    }
    applyVisionDebugVisibility();

    startVisionLoop();
    startFaceFollowRender();
}

function stopVision() {
    if (visionLoopHandle) {
        clearInterval(visionLoopHandle);
        visionLoopHandle = null;
    }
    if (visionStream) {
        visionStream.getTracks().forEach(t => t.stop());
        visionStream = null;
    }
    visionVideo.srcObject = null;
    visionInitialized = false;
    faceTarget.active = false;
    if (visionDebugEl) visionDebugEl.classList.remove('visible');
}

function startVisionLoop() {
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.5
    });

    let lastSeen = 0;
    visionLoopHandle = setInterval(async () => {
        if (!visionInitialized || visionVideo.paused || visionVideo.ended) return;

        let detection = null;
        try {
            detection = await faceapi.detectSingleFace(visionVideo, detectorOptions);
        } catch (err) {
            // Detection can throw transiently if the video frame isn't ready
            console.debug('face detection skipped:', err && err.message);
        }

        if (detection) {
            const { x, y, width, height } = detection.box;
            const vw = visionVideo.videoWidth || 320;
            const vh = visionVideo.videoHeight || 240;

            // Center of face in video-normalized coordinates (0..1)
            const cx = (x + width / 2) / vw;
            const cy = (y + height / 2) / vh;

            // Video is mirrored (user-facing). Flip X so eyes follow naturally
            // from the user's perspective: user moves right -> eyes go right on screen.
            let normX = (cx - 0.5) * -2 * FACE_INPUT_GAIN; // flipped + amplified
            let normY = (cy - 0.5) * 2 * FACE_INPUT_GAIN;

            // Clamp first, then apply an ease-out curve so small moves are more visible
            normX = Math.max(-1, Math.min(1, normX));
            normY = Math.max(-1, Math.min(1, normY));
            const shapedX = Math.sign(normX) * Math.pow(Math.abs(normX), FACE_RESPONSE_POWER);
            const shapedY = Math.sign(normY) * Math.pow(Math.abs(normY), FACE_RESPONSE_POWER);

            faceTarget.x = shapedX * FACE_MAX_OFFSET_X;
            faceTarget.y = shapedY * FACE_MAX_OFFSET_Y;
            faceTarget.active = true;

            // Greet when a face appears after an absence, with a cooldown
            const now = Date.now();
            const wasAbsent = (now - lastFaceSeenAt) > FACE_ABSENCE_FOR_GREET_MS;
            const offCooldown = (now - lastGreetingAt) > FACE_GREETING_COOLDOWN_MS;
            if (!isGreeting && !isSystemSpeaking && wasAbsent && offCooldown) {
                lastGreetingAt = now;
                triggerGreeting();
            }
            lastFaceSeenAt = now;
            lastSeen = now;
        } else if (Date.now() - lastSeen > 1000) {
            // Lose tracking after ~1s with no face
            faceTarget.active = false;
            faceTarget.x = 0;
            faceTarget.y = 0;
        }

        // Debug preview render
        if (visionDebug && visionDebugCtx) {
            drawVisionDebug(detection);
        }
    }, 100); // ~10 fps is smooth and cheap
}

function drawVisionDebug(detection) {
    const vw = visionVideo.videoWidth || 320;
    const vh = visionVideo.videoHeight || 240;
    if (visionDebugCanvas.width !== vw) visionDebugCanvas.width = vw;
    if (visionDebugCanvas.height !== vh) visionDebugCanvas.height = vh;

    visionDebugCtx.drawImage(visionVideo, 0, 0, vw, vh);

    if (detection) {
        const { x, y, width, height } = detection.box;
        visionDebugCtx.lineWidth = 3;
        visionDebugCtx.strokeStyle = '#00e5ff';
        visionDebugCtx.shadowColor = '#00e5ff';
        visionDebugCtx.shadowBlur = 12;
        visionDebugCtx.strokeRect(x, y, width, height);
        visionDebugCtx.shadowBlur = 0;

        if (visionDebugLabel) {
            const score = Math.round((detection.score || 0) * 100);
            visionDebugLabel.textContent = `Face ${score}%`;
            visionDebugLabel.classList.add('active');
        }
    } else if (visionDebugLabel) {
        visionDebugLabel.textContent = 'No face';
        visionDebugLabel.classList.remove('active');
    }
}

function startFaceFollowRender() {
    // Smoothly ease the wrapper toward the face target at ~60fps.
    function tick() {
        if (!visionInitialized) return; // stops the loop when vision is off

        // Yield to speaking animation and greeting animation; both drive their own transforms.
        if (!isSystemSpeaking && !isGreeting) {
            if (faceTarget.active) {
                faceSmoothed.x += (faceTarget.x - faceSmoothed.x) * FACE_SMOOTHING;
                faceSmoothed.y += (faceTarget.y - faceSmoothed.y) * FACE_SMOOTHING;
                wrapper.style.transform =
                    `translate(${faceSmoothed.x.toFixed(1)}px, ${faceSmoothed.y.toFixed(1)}px) rotate(0deg)`;
            } else {
                // Ease back toward center when no face is visible
                faceSmoothed.x += (0 - faceSmoothed.x) * FACE_SMOOTHING;
                faceSmoothed.y += (0 - faceSmoothed.y) * FACE_SMOOTHING;
                if (Math.abs(faceSmoothed.x) > 0.3 || Math.abs(faceSmoothed.y) > 0.3) {
                    wrapper.style.transform =
                        `translate(${faceSmoothed.x.toFixed(1)}px, ${faceSmoothed.y.toFixed(1)}px) rotate(0deg)`;
                }
            }
        }

        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ============================================================
// Greeting sequence (shocked -> happy -> speak greeting)
// ============================================================
const GREETINGS = [
    "Oh, hi there!",
    "Hey, nice to see you!",
    "Hello, friend!",
    "Oh hello, you startled me!",
    "Hi, welcome back!"
];

async function triggerGreeting() {
    if (isGreeting || isSystemSpeaking) return;
    isGreeting = true;

    try {
        // Wake up if we were sleeping
        if (isSleeping) {
            isSleeping = false;
        }

        // 1. Shocked reaction
        setEmotion('shocked');
        await wait(900);

        // 2. Switch to happy and speak a greeting
        setEmotion('happy');
        const line = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        await speakText(line);

        // 3. Settle back to neutral
        setEmotion('neutral');
    } catch (err) {
        console.debug('Greeting interrupted:', err && err.message);
    } finally {
        isGreeting = false;
    }
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
