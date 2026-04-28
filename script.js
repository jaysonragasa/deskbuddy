let isAudioInitialized = false;
let recognition;
let isSystemSpeaking = false;
let ollamaUrl = localStorage.getItem('ollamaUrl') || 'http://localhost:11434';
let selectedModel = localStorage.getItem('selectedModel') || '';
let showSubtitles = localStorage.getItem('showSubtitles') === 'true';
let conversationContext = []; // Stores token history of conversation

// DOM Elements
const wrapper = document.getElementById('eyes-wrapper');
const mainContainer = document.getElementById('main-container');
const settingsOverlay = document.getElementById('settings-overlay');
const tapOverlay = document.getElementById('tap-overlay');
const statusText = document.getElementById('status-text');
const statusIndicator = document.getElementById('status-indicator');

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

window.addEventListener('DOMContentLoaded', () => {
    startRandomBlinking();
    startRandomMovements();
    if (ollamaUrl) fetchModels();
});

// Wake Interaction
mainContainer.addEventListener('click', () => {
    // If not initialized, initialize audio on first interaction
    if (!isAudioInitialized) {
        initSpeechRecognition();
        isAudioInitialized = true;
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
                if (!isSystemSpeaking) {
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
CRITICAL RULE: You MUST begin EVERY response with exactly ONE of the following tags that best matches your emotion: [neutral], [happy], [sad], [angry], [surprised].
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
        const emoMatch = aiText.match(/\[(neutral|happy|sad|angry|surprised)\]/i);
        if (emoMatch) {
            emotion = emoMatch[1].toLowerCase();
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
            resolve();
        };
        utterance.onerror = () => {
            clearInterval(talkingInterval);
            isSystemSpeaking = false;
            wrapper.style.transform = `translate(0px, 0px) rotate(0deg)`;
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
