import { state, PRODUCTS, PERSONAS } from "./state.js";
import { db, getPath } from "./firebase-config.js";
import { GEMINI_API_KEYS } from "./api-key.js";

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB Persistent Audio Cache Manager
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'gemini_audio_cache_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_store';

let dbInstance = null;

function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (e) => {
                dbInstance = e.target.result;
                resolve(dbInstance);
            };
            request.onerror = (e) => {
                console.error('[IndexedDB] Init error:', e.target.error);
                reject(e.target.error);
            };
        } catch (err) {
            reject(err);
        }
    });
}

export async function getAudioFromDB(key) {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

export async function saveAudioToDB(key, float32Array) {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(float32Array, key);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

export async function clearAudioCacheDB() {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => {
                console.debug('[IndexedDB] Audio cache cleared successfully');
                resolve(true);
            };
            request.onerror = (e) => {
                console.error('[IndexedDB] Clear cache error:', e.target.error);
                reject(e.target.error);
            };
        });
    } catch (e) {
        console.error('[IndexedDB] Clear cache catch error:', e);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AudioContext helpers
// ─────────────────────────────────────────────────────────────────────────────

export function initAudioContext() {
    if (!state.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            state.audioCtx = new AudioContextClass();
        }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
    }
    return state.audioCtx;
}

export function forceUnlockAudio() {
    if (state.isAudioUnlocked) return;

    try {
        const ctx = initAudioContext();
        if (ctx) {
            const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);

            state.isAudioUnlocked = true;
            hideAudioBlockOverlay();
            updateAudioStatusBadge(true);
        }
    } catch (e) {
        console.warn("AudioContext unblocking failed:", e);
        showAudioBlockOverlay();
        updateAudioStatusBadge(false);
    }
}

export function updateAudioStatusBadge(ready) {
    const badge = document.getElementById('audio-status-badge');
    if (!badge) return;
    if (ready) {
        badge.className = "text-[13px] font-bold text-emerald-500 flex items-center gap-1";
        badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>พร้อมใช้`;
    } else {
        badge.className = "text-[13px] font-bold text-rose-500 flex items-center gap-1";
        badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-505 animate-ping"></span>บล็อกอยู่`;
    }
}

export function testSpeakerSound() {
    try {
        const ctx = initAudioContext();
        if (!ctx) {
            if (window.showToast) window.showToast("ไม่สามารถเรียกชุดโปรแกรม Web Audio ได้ในเบราว์เซอร์นี้", false);
            return;
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

        osc.start(0);
        osc.stop(ctx.currentTime + 0.4);

        state.isAudioUnlocked = true;
        hideAudioBlockOverlay();
        updateAudioStatusBadge(true);
        if (window.showToast) window.showToast("เล่นเสียงบี๊บทดสอบแล้ว! คุณสามารถได้ยินเสียงพูดของ AI แน่นอน", true);
    } catch (e) {
        console.error("Test sound trigger failure", e);
        if (window.showToast) window.showToast("ไม่สามารถเปิดเสียงได้: " + e.message, false);
        if (window.showDebugError) window.showDebugError("AudioContext Init Error: " + e.message);
    }
}

export function showAudioBlockOverlay() {
    const banner = document.getElementById('audio-blocked-banner');
    if (banner) {
        banner.classList.remove('hidden');
        banner.classList.add('flex');
    }
}

export function hideAudioBlockOverlay() {
    const banner = document.getElementById('audio-blocked-banner');
    if (banner) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX #1 — PCM Decoding
// Gemini TTS returns LINEAR16 (signed 16-bit integer PCM) at 24 kHz.
// Treating raw bytes as Float32Array was the root cause of all distortion.
// ─────────────────────────────────────────────────────────────────────────────

export function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Decode a base64 LINEAR16 PCM blob and return a normalized Float32Array.
 * @param {string} base64Data
 * @returns {Float32Array}
 */
function decodeLinear16ToFloat32(base64Data) {
    const arrayBuf = base64ToArrayBuffer(base64Data);
    const int16 = new Int16Array(arrayBuf);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;   // normalize to [-1, 1]
    }
    return float32;
}

/**
 * Play a pre-decoded Float32 PCM buffer immediately.
 * Returns a Promise that resolves when playback ends.
 */
export function playPcmBase64(base64Data, sampleRate = 24000) {
    return new Promise((resolve, reject) => {
        try {
            const ctx = initAudioContext();
            if (!ctx) { reject("Web Audio not available"); return; }

            const float32 = decodeLinear16ToFloat32(base64Data);
            const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
            audioBuffer.getChannelData(0).set(float32);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.onended = () => resolve();
            source.start(0);
            state.activeAudioSource = source;
        } catch (e) {
            console.error("PCM Playback Error:", e);
            reject(e);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX #2 & #3 — Streaming Audio Playback Queue
// Schedules PCM chunks back-to-back on the AudioContext timeline so the first
// chunk begins playing while the rest of the TTS stream is still downloading.
// ─────────────────────────────────────────────────────────────────────────────

class AudioPlaybackQueue {
    /**
     * @param {AudioContext} ctx
     * @param {number} sampleRate - PCM sample rate in Hz (Gemini TTS = 24000)
     */
    constructor(ctx, sampleRate = 24000) {
        this.ctx = ctx;
        this.sampleRate = sampleRate;
        this.nextStartTime = 0;
        this._sources = [];
        this._lastSource = null;
        this.stopped = false;
    }

    /**
     * Append a Float32 PCM chunk to the playback timeline.
     * Returns the AudioBufferSourceNode (caller can attach onended).
     * @param {Float32Array} float32Data
     * @returns {AudioBufferSourceNode}
     */
    scheduleChunk(float32Data) {
        if (this.stopped || float32Data.length === 0) return null;

        const buffer = this.ctx.createBuffer(1, float32Data.length, this.sampleRate);
        buffer.getChannelData(0).set(float32Data);

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);

        // Schedule at least 80 ms in the future to give the decoder breathing room
        const earliest = this.ctx.currentTime + 0.08;
        const startTime = Math.max(earliest, this.nextStartTime);
        source.start(startTime);
        this.nextStartTime = startTime + buffer.duration;

        this._sources.push(source);
        this._lastSource = source;
        return source;
    }

    /** Returns a Promise that resolves when the last scheduled chunk finishes. */
    waitUntilDone() {
        return new Promise((resolve) => {
            if (!this._lastSource) { resolve(); return; }
            this._lastSource.onended = resolve;
        });
    }

    /** Stop all scheduled and playing chunks immediately. */
    stop() {
        this.stopped = true;
        this._sources.forEach(s => { try { s.stop(); } catch (e) {} });
        this._sources = [];
        this._lastSource = null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: cancel any in-flight requests before starting new ones
// ─────────────────────────────────────────────────────────────────────────────

function abortPreviousRequests() {
    if (state.ttsAbortController) {
        state.ttsAbortController.abort();
        state.ttsAbortController = null;
    }
    if (state.llmAbortController) {
        state.llmAbortController.abort();
        state.llmAbortController = null;
    }
    if (state.audioQueue) {
        state.audioQueue.stop();
        state.audioQueue = null;
    }
    if (state.activeAudioSource) {
        try { state.activeAudioSource.stop(); } catch (e) {}
        state.activeAudioSource = null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Key TTS Rotation System
// Automatically cycles through API keys when quota is hit (HTTP 429).
// Exhausted keys are suspended in-memory for 2 minutes (cooling-off period)
// so that transient 15 RPM rate limits do not block them forever.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the keys array from api-key.js at startup.
 * Must be called once during app bootstrap before any TTS.
 */
export function initTtsKeys() {
    // Clear legacy localStorage data if present to ensure clean startup
    try {
        localStorage.removeItem('tts_exhausted_keys');
    } catch (e) {}

    state.ttsExhaustedKeys = new Set();

    // Prioritize user custom API key if present, followed by key rotation array from api-key.js
    const customKey = state.geminiApiKey ? state.geminiApiKey.trim() : "";
    let keys = (GEMINI_API_KEYS && GEMINI_API_KEYS.length > 0)
        ? GEMINI_API_KEYS.filter(k => k && k.trim().length > 10)
        : [];

    if (customKey && customKey.length > 10 && !keys.includes(customKey)) {
        keys = [customKey, ...keys];
    }

    if (keys.length === 0) {
        keys = [state.geminiApiKey];
    }

    state.ttsApiKeys = keys;

    // Start from the first non-exhausted key
    state.ttsKeyIndex = keys.findIndex(k => !state.ttsExhaustedKeys.has(k));
    if (state.ttsKeyIndex < 0) state.ttsKeyIndex = 0;

    console.debug(`[TTS-Keys] Initialized with ${keys.length} key(s). Active index: ${state.ttsKeyIndex}`);
}

/**
 * Returns the currently active TTS/Chat API key.
 * If all keys are exhausted, returns the first key and shows a warning.
 */
export function getActiveTtsKey() {
    const keys = state.ttsApiKeys && state.ttsApiKeys.length > 0
        ? state.ttsApiKeys
        : [state.geminiApiKey];

    // Find next non-exhausted key starting from ttsKeyIndex
    for (let i = 0; i < keys.length; i++) {
        const idx = (state.ttsKeyIndex + i) % keys.length;
        if (!state.ttsExhaustedKeys.has(keys[idx])) {
            state.ttsKeyIndex = idx;
            return keys[idx];
        }
    }

    // All keys exhausted — use the least recently exhausted (first key)
    console.warn('[TTS-Keys] ⚠️ All API keys have hit their daily quota.');
    return keys[0];
}

/**
 * Mark a key as exhausted (429 received) and rotate to the next one.
 * Key will be suspended in-memory for 2 minutes (cooling-off period)
 * before automatically re-entering the pool.
 */
export function markKeyExhausted(key) {
    if (!key) return;
    
    // Add to exhausted list in-memory
    state.ttsExhaustedKeys.add(key);

    // Set a 2-minute cooling-off period, then restore key to the rotation pool
    setTimeout(() => {
        state.ttsExhaustedKeys.delete(key);
        console.debug(`[TTS-Keys] 🔄 Key unblocked after 2-minute cooling-off period: ${key.substring(0, 8)}...`);
    }, 120000);

    // Rotate to next available key
    const keys = state.ttsApiKeys && state.ttsApiKeys.length > 0
        ? state.ttsApiKeys
        : [state.geminiApiKey];

    const nextIdx = keys.findIndex((k, i) => i !== state.ttsKeyIndex && !state.ttsExhaustedKeys.has(k));
    if (nextIdx >= 0) {
        state.ttsKeyIndex = nextIdx;
        console.debug(`[TTS-Keys] Key exhausted. Rotated to key index ${nextIdx}`);
        if (window.showToast) window.showToast(`เปลี่ยนไปใช้ API Key ชุดถัดไป (#${nextIdx + 1}) อัตโนมัติ`, true);
    } else {
        console.warn('[TTS-Keys] No more available keys — all exhausted for today.');
        if (window.showToast) window.showToast('API Key ทุกชุดถึง quota วันนี้แล้ว จะปลดล็อกอัตโนมัติภายใน 2 นาที', false);
    }
}

// Gemini streamGenerateContent?alt=sse delivers Server-Sent Events.
// ─────────────────────────────────────────────────────────────────────────────

async function* readSSEStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // retain incomplete trailing line

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data:') && trimmed !== 'data: [DONE]') {
                    const jsonStr = trimmed.slice(5).trim();
                    if (!jsonStr) continue;
                    try {
                        yield JSON.parse(jsonStr);
                    } catch (e) {
                        console.warn("SSE parse error:", e, jsonStr);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-Warming System: Instant Greetings via Runtime Audio Cache
//
// Architecture:
//   Card Click ──► preWarmGreeting()  ──► TTS stream ──► Float32[] stored in Map
//   startCall() ──► playGreetingFromCache() ──► plays from memory (0 network)
//   Greeting playing ──► warmUpLlmConnection() ──► HTTPS handshake pre-established
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-fetch the TTS audio for a specialist's greeting BEFORE the call starts.
 * Called the instant the user clicks a specialist card or the info modal "Start" button.
 * Stores decoded Float32Array chunks in state.greetingAudioCache keyed by specialist.id.
 *
 * @param {object} specialist  - The Firestore specialist object
 * @param {string} greetingText - The greeting string to synthesize
 */
export async function preWarmGreeting(specialist, greetingText) {
    if (!specialist?.id || !greetingText) return;

    const cacheKey = specialist.id;

    // 1. Check in-memory cache first
    if (state.greetingAudioCache.has(cacheKey)) {
        console.debug(`[PreWarm] Memory cache hit for "${specialist.fullname}" — skipping fetch`);
        return;
    }

    // 2. Check IndexedDB persistent cache next
    const persistedAudio = await getAudioFromDB(cacheKey);
    if (persistedAudio) {
        state.greetingAudioCache.set(cacheKey, persistedAudio);
        console.debug(`[PreWarm] IndexedDB cache hit for "${specialist.fullname}" — loaded into memory`);
        return;
    }

    console.debug(`[PreWarm] Starting background TTS pre-fetch for "${specialist.fullname}"`);

    const activeKey = getActiveTtsKey();
    if (!activeKey) return;

    try {
        const vp = getVoiceParams(specialist);
        const payload = {
            contents: [{ parts: [{ text: greetingText }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: vp.voice } }
                }
            }
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:streamGenerateContent?alt=sse&key=${activeKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            if (response.status === 429) {
                markKeyExhausted(activeKey);
            }
            return; // silent fail — live TTS is the fallback
        }

        const chunks = [];
        for await (const json of readSSEStream(response)) {
            const inlineData = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (inlineData?.data) {
                try {
                    chunks.push(decodeLinear16ToFloat32(inlineData.data));
                } catch (e) {
                    console.warn('[PreWarm] Chunk decode error:', e);
                }
            }
        }

        if (chunks.length > 0) {
            // Concatenate all chunks into a single Float32Array
            const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
            const concatenated = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                concatenated.set(chunk, offset);
                offset += chunk.length;
            }

            state.greetingAudioCache.set(cacheKey, concatenated);
            await saveAudioToDB(cacheKey, concatenated);
            console.debug(`[PreWarm] ✅ Cached PCM buffer in memory & IndexedDB for "${specialist.fullname}"`);
        }
    } catch (err) {
        console.warn('[PreWarm] Background TTS pre-fetch failed (will use live TTS):', err);
        // Silent fail — startCall() falls back to live speakText() automatically
    }
}

/**
 * Play a pre-warmed greeting from cache if available, otherwise fall back to live speakText.
 * Returns true if played from cache, false if falling back to live TTS.
 *
 * @param {string} specialistId
 * @param {string} greetingText - Fallback text for live speakText
 * @param {{ voice, rate, pitch }} vp - Voice parameters
 * @returns {boolean} true = played from cache
 */
export function playGreetingFromCache(specialistId, greetingText, vp) {
    const chunks = state.greetingAudioCache.get(specialistId);

    if (!chunks || (Array.isArray(chunks) && chunks.length === 0)) {
        console.debug(`[PreWarm] Cache miss for ${specialistId} — falling back to live TTS`);
        // Async: live speakText handles isSpeaking state internally
        speakText(greetingText, vp.voice, vp.rate, vp.pitch);
        return false;
    }

    console.debug(`[PreWarm] 🚀 Playing from cache — ZERO network latency`);

    // Optimistic UI flip immediately (same as speakText)
    state.isSpeaking = true;
    updateSpeechUI();
    abortPreviousRequests();

    const ctx = initAudioContext();
    if (!ctx) {
        speakText(greetingText, vp.voice, vp.rate, vp.pitch);
        return false;
    }

    const queue = new AudioPlaybackQueue(ctx, 24000);
    state.audioQueue = queue;

    if (chunks instanceof Float32Array) {
        queue.scheduleChunk(chunks);
    } else if (Array.isArray(chunks)) {
        chunks.forEach(float32 => queue.scheduleChunk(float32));
    }

    // Wait for last chunk to finish, then restore listening state
    queue.waitUntilDone().then(() => {
        state.isSpeaking = false;
        updateSpeechUI();
        if (state.isConnected && !state.isMuted) startListening();
    });

    return true;
}

/**
 * Speculative LLM connection warm-up.
 * Fires a minimal streaming request to the Gemini endpoint to pre-establish
 * the HTTPS/TCP connection while the greeting audio is playing.
 * The response is intentionally discarded — this is purely for connection priming.
 */
export async function warmUpLlmConnection() {
    const activeKey = getActiveTtsKey();
    if (!activeKey) return;

    // Abort any previous warm-up
    if (state.warmupAbortController) {
        state.warmupAbortController.abort();
    }
    state.warmupAbortController = new AbortController();

    try {
        console.debug('[WarmUp] Priming LLM HTTPS connection...');
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${activeKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'hi' }] }],
                generationConfig: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1 }
            }),
            signal: state.warmupAbortController.signal
        });
        // Read and discard the response body to fully release the connection
        if (response.body) {
            const reader = response.body.getReader();
            while (true) {
                const { done } = await reader.read();
                if (done) break;
            }
        }
        console.debug('[WarmUp] ✅ LLM connection primed and standing by');
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.debug('[WarmUp] Connection warm-up silently failed:', err.message);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX #2 — speakText with Streaming TTS
// Uses streamGenerateContent so the first audio chunk starts playing
// ~1-2 s after the request is sent instead of waiting for the full blob.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map specialist gender/age to a { voice, rate, pitch } config object.
 * Exported so app.js can reuse the same mapping without duplication.
 */
export function getVoiceParams(specialist) {
    if (!specialist) return { voice: 'Aoede', rate: 0.95, pitch: 1.0 };
    const gender = specialist.gender || 'Female';
    const age    = Number(specialist.age) || 35;
    const isFemale = gender && (
        gender.toLowerCase().includes('female') ||
        gender.includes('หญิง') ||
        gender.toLowerCase() === 'f'
    );

    if (isFemale) {
        if (age < 35)      return { voice: 'Leda',     rate: 1.05, pitch: 1.35 };
        if (age > 55)      return { voice: 'Gacrux',   rate: 0.85, pitch: 1.10 };
        return                    { voice: 'Aoede',    rate: 0.95, pitch: 1.25 };
    } else {
        if (age < 35)      return { voice: 'Puck',       rate: 1.05, pitch: 0.90 };
        if (age > 55)      return { voice: 'Sadaltager', rate: 0.80, pitch: 0.75 };
        return                    { voice: 'Charon',     rate: 0.95, pitch: 0.85 };
    }
}

function detectLanguage(text) {
    if (!text) return 'th-TH';
    const englishMatches = (text.match(/[a-zA-Z]/g) || []).length;
    const thaiMatches = (text.match(/[\u0e00-\u0e7f]/g) || []).length;
    return englishMatches > thaiMatches ? 'en-US' : 'th-TH';
}

export async function speakText(text, customVoiceName = null, customRate = null, customPitch = null) {
    // ── Fix #9: Optimistic UI — flip to "Speaking" IMMEDIATELY before any network call
    state.isSpeaking = true;
    updateSpeechUI();

    // Executive Assistant UI: Show subtitles & glows & start mouth animation
    const bubble = document.getElementById('ai-speech-bubble');
    const subtitleText = document.getElementById('ai-subtitle-text');
    if (state.isExecutiveAssistant && bubble && subtitleText) {
        subtitleText.innerText = text;
        bubble.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
        bubble.classList.add('opacity-100', 'translate-y-0');
        
        if (window.startMouthAnimation) {
            window.startMouthAnimation();
        }

        // Hologram pulses for photo style
        const holoPulse = document.getElementById('hologram-pulse');
        const holoWaves = document.getElementById('hologram-waves');
        if (holoPulse && holoWaves && state.currentStyle === 'photo') {
            holoPulse.classList.remove('opacity-0');
            holoWaves.classList.remove('opacity-0');
        }
    }

    // ── Turn-Taking Lock: explicitly abort any live mic session the instant AI starts.
    if (state.recognition) {
        try {
            state.recognition.onresult = null;
            state.recognition.onerror  = null;
            state.recognition.onend    = null;
            state.recognition.abort();
        } catch (e) {}
        state.recognition = null;
    }
    state.isListening = false;

    // Cancel any stale in-flight audio
    abortPreviousRequests();

    // ── Instant Response Mode (Web Speech API) ──
    if (state.useLocalTts) {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = detectLanguage(text);
            utterance.rate  = customRate  || (state.selectedPersona === 'hurry' ? 1.05 : 0.92);
            utterance.pitch = customPitch || 1.0;
            utterance.volume = 1;

            window.activeUtterance = utterance;

            await new Promise((resolve) => {
                utterance.onend   = () => {
                    window.activeUtterance = null;
                    resolve();
                };
                utterance.onerror = (e) => {
                    console.error("SpeechSynthesis error:", e);
                    window.activeUtterance = null;
                    resolve();
                };
                window.speechSynthesis.speak(utterance);
            });
        }
        state.isSpeaking = false;
        updateSpeechUI();
        if (state.isConnected && !state.isMuted) startListening();
        return;
    }

    // ── Quota Saving: In-Memory Audio PCM Caching ───────────────────────────
    if (!state.speechAudioCache) {
        state.speechAudioCache = new Map();
    }

    const normalizedText = text.trim().toLowerCase();
    
    // 1. Check in-memory cache
    if (state.speechAudioCache.has(normalizedText)) {
        console.debug(`[TTS-Cache] 🎯 Memory cache hit — Replaying saved audio for: "${text}"`);
        try {
            const cachedFloat32 = state.speechAudioCache.get(normalizedText);
            const ctx = initAudioContext();
            const queue = new AudioPlaybackQueue(ctx, 24000);
            state.audioQueue = queue;
            queue.scheduleChunk(cachedFloat32);
            await queue.waitUntilDone();
            
            state.isSpeaking = false;
            updateSpeechUI();
            if (state.isConnected && !state.isMuted) startListening();
            return; // Exit directly to save API quota
        } catch (cachePlayErr) {
            console.warn("[TTS-Cache] Cache playback error, falling back to live API call:", cachePlayErr);
        }
    }

    // 2. Check IndexedDB persistent cache
    const persistedAudio = await getAudioFromDB(normalizedText);
    if (persistedAudio) {
        console.debug(`[TTS-Cache] 🎯 IndexedDB hit — Replaying saved audio for: "${text}"`);
        state.speechAudioCache.set(normalizedText, persistedAudio);
        try {
            const ctx = initAudioContext();
            const queue = new AudioPlaybackQueue(ctx, 24000);
            state.audioQueue = queue;
            queue.scheduleChunk(persistedAudio);
            await queue.waitUntilDone();
            
            state.isSpeaking = false;
            updateSpeechUI();
            if (state.isConnected && !state.isMuted) startListening();
            return; // Exit directly to save API quota
        } catch (cachePlayErr) {
            console.warn("[TTS-Cache] IndexedDB playback error, falling back to live API call:", cachePlayErr);
        }
    }

    // Voice selection
    let voiceName = customVoiceName;
    if (!voiceName) {
        if (state.isExecutiveAssistant) {
            voiceName = state.currentGender === 'male' ? 'Charon' : 'Aoede';
        } else {
            voiceName = "Aoede";
            if (state.selectedPersona === 'curious' || (state.currentActiveSpecialist?.personality === 'curious')) voiceName = "Charon";
            if (state.selectedPersona === 'hurry'   || (state.currentActiveSpecialist?.personality === 'hurry'))   voiceName = "Kore";
        }
    }

    const payload = {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName }
                }
            }
        }
    };

    // ── Key-Rotation TTS Retry Loop ─────────────────────────────────────────
    // Tries each available key in order. On 429 marks the key exhausted and
    // immediately retries with the next key — no browser fallback until all keys
    // are exhausted for the day.
    const keys = state.ttsApiKeys && state.ttsApiKeys.length > 0
        ? state.ttsApiKeys
        : [state.geminiApiKey];

    let ttsSuccess = false;

    for (let attempt = 0; attempt < keys.length; attempt++) {
        const activeKey = getActiveTtsKey();

        try {
            if (!activeKey) throw new Error("API Key required.");

            // ── Streaming TTS endpoint ──────────────────────────────────────
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:streamGenerateContent?alt=sse&key=${activeKey}`;
            const ttsAbort = new AbortController();
            state.ttsAbortController = ttsAbort;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: ttsAbort.signal
            });

            if (!response.ok) {
                if (response.status === 429) {
                    markKeyExhausted(activeKey);
                    console.warn(`[TTS] Key ${attempt + 1}/${keys.length} hit quota. Rotating...`);
                    continue; // retry with next key
                }
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData?.error?.message || `HTTP ${response.status}`);
            }

            const ctx = initAudioContext();
            const queue = new AudioPlaybackQueue(ctx, 24000);
            state.audioQueue = queue;

            let chunkCount = 0;
            let fullFloat32Buffer = [];

            // Consume the SSE stream — schedule each audio chunk as it arrives
            for await (const json of readSSEStream(response)) {
                if (ttsAbort.signal.aborted) break;

                const inlineData = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
                if (inlineData?.data) {
                    try {
                        const float32 = decodeLinear16ToFloat32(inlineData.data);
                        queue.scheduleChunk(float32);
                        fullFloat32Buffer.push(float32);
                        chunkCount++;
                        if (chunkCount === 1) {
                            console.debug(`[TTS] First audio chunk scheduled at t=${ctx.currentTime.toFixed(2)}s`);
                        }
                    } catch (decodeErr) {
                        console.warn("[TTS] Chunk decode error:", decodeErr);
                    }
                }
            }

            if (chunkCount === 0) throw new Error("TTS stream returned no audio data");

            // Wait for the last chunk to finish playing
            await queue.waitUntilDone();
            ttsSuccess = true;

            // Concatenate and store in memory speech cache for quota-preservation
            if (fullFloat32Buffer.length > 0) {
                try {
                    const totalLength = fullFloat32Buffer.reduce((acc, val) => acc + val.length, 0);
                    const concatenated = new Float32Array(totalLength);
                    let offset = 0;
                    for (const chunk of fullFloat32Buffer) {
                        concatenated.set(chunk, offset);
                        offset += chunk.length;
                    }
                    state.speechAudioCache.set(normalizedText, concatenated);
                    await saveAudioToDB(normalizedText, concatenated);
                    console.debug(`[TTS-Cache] 💾 Cached response in memory & IndexedDB for: "${text}" (${totalLength} PCM samples)`);
                } catch (cacheErr) {
                    console.warn("[TTS-Cache] Failed caching audio:", cacheErr);
                }
            }
            break; // ✅ success — exit retry loop

        } catch (err) {
            if (err.name === 'AbortError') {
                console.debug("[TTS] Request aborted — new speech started.");
                return;
            }
            // Non-quota error: log and fall through to browser fallback
            console.warn(`[TTS] Attempt ${attempt + 1} failed:`, err.message);
            break;
        }
    }

    if (!ttsSuccess) {
        // ── Browser SpeechSynthesis fallback (only when ALL keys exhausted) ──
        console.warn("[TTS] All keys exhausted or failed — using browser SpeechSynthesis fallback.");

        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = detectLanguage(text);
            utterance.rate  = customRate  || (state.selectedPersona === 'hurry' ? 1.05 : 0.92);
            utterance.pitch = customPitch || 1.0;
            utterance.volume = 1;

            // Bind to window to completely avoid garbage collection hang bug in Chrome
            window.activeUtterance = utterance;

            await new Promise((resolve) => {
                utterance.onend   = () => {
                    window.activeUtterance = null;
                    resolve();
                };
                utterance.onerror = (e) => {
                    console.error("SpeechSynthesis error:", e);
                    window.activeUtterance = null;
                    resolve();
                };
                window.speechSynthesis.speak(utterance);
            });
        }
    }

    state.isSpeaking = false;
    updateSpeechUI();

    // Executive Assistant UI: Hide subtitles & glows & stop mouth animation
    if (state.isExecutiveAssistant) {
        if (window.stopMouthAnimation) {
            window.stopMouthAnimation();
        }
        
        const bubble = document.getElementById('ai-speech-bubble');
        if (bubble) {
            setTimeout(() => {
                if (!state.isSpeaking) {
                    bubble.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
                    bubble.classList.remove('opacity-100', 'translate-y-0');
                }
            }, 1500);
        }

        const holoPulse = document.getElementById('hologram-pulse');
        const holoWaves = document.getElementById('hologram-waves');
        if (holoPulse && holoWaves) {
            holoPulse.classList.add('opacity-0');
            holoWaves.classList.add('opacity-0');
        }
    }

    if (state.isConnected && !state.isMuted) startListening();
}

// ─────────────────────────────────────────────────────────────────────────────
// Instant Interrupt Control
// ─────────────────────────────────────────────────────────────────────────────

export function interruptAI() {
    console.debug('[Interrupt] User triggered instant interrupt');

    if (state.ttsAbortController) {
        state.ttsAbortController.abort();
        state.ttsAbortController = null;
    }
    if (state.llmAbortController) {
        state.llmAbortController.abort();
        state.llmAbortController = null;
    }

    if (state.audioQueue) {
        state.audioQueue.stop();
        state.audioQueue = null;
    }
    if (state.activeAudioSource) {
        try { state.activeAudioSource.stop(); } catch (e) {}
        state.activeAudioSource = null;
    }

    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }

    state.isSpeaking = false;
    updateSpeechUI();

    if (state.isExecutiveAssistant) {
        if (window.stopMouthAnimation) {
            window.stopMouthAnimation();
        }
        const bubble = document.getElementById('ai-speech-bubble');
        if (bubble) {
            bubble.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            bubble.classList.remove('opacity-100', 'translate-y-0');
        }
        const holoPulse = document.getElementById('hologram-pulse');
        const holoWaves = document.getElementById('hologram-waves');
        if (holoPulse && holoWaves) {
            holoPulse.classList.add('opacity-0');
            holoWaves.classList.add('opacity-0');
        }
    }

    if (state.isConnected && !state.isMuted) {
        startListening();
    }
}

window.interruptAI = interruptAI;

// ─────────────────────────────────────────────────────────────────────────────
// Speech Recognition
// ─────────────────────────────────────────────────────────────────────────────

export function startListening() {
    if (state.recognition) {
        try {
            state.recognition.onresult = null;
            state.recognition.onerror  = null;
            state.recognition.onend    = null;
            state.recognition.abort();
        } catch (e) {}
        state.recognition = null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (window.enableTextFallback) window.enableTextFallback();
        return;
    }

    state.recognition = new SpeechRecognition();
    state.recognition.continuous      = false;
    state.recognition.interimResults  = false;
    state.recognition.lang            = 'th-TH';

    state.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript.trim()) handleUserSpeech(transcript);
    };

    state.recognition.onend = () => {
        if (state.isConnected && !state.isSpeaking && !state.isMuted) {
            setTimeout(() => {
                if (state.isConnected && !state.isSpeaking && !state.isMuted) startListening();
            }, 500);
        } else {
            state.isListening = false;
            updateSpeechUI();
        }
    };

    state.recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);

        if (event.error === 'not-allowed') {
            state.isConnected = false;
            if (window.showSetupError) window.showSetupError("เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้ไมค์ กรุณาเปิดสิทธิ์เข้าใช้ในหน้าตั้งค่าก่อนคุย");
            if (window.changeStage) window.changeStage('setup');
        } else if (event.error === 'network') {
            state.isMuted     = true;
            state.isListening = false;
            updateSpeechUI();

            const lastMsg = state.transcriptHistory[state.transcriptHistory.length - 1];
            if (!lastMsg || lastMsg.role !== 'system') {
                state.transcriptHistory.push({
                    role: 'system',
                    text: '⚠️ ตรวจพบสัญญาณเครือข่ายขัดข้องชั่วคราว เพื่อความลื่นไหลพนักงานสามารถพิมพ์บทเสนอขายผ่านแชทด้านล่าง โดย AI จะยังตอบกลับด้วยเสียงพูดแสนไพเราะตามเดิมค่ะ'
                });
                if (window.renderTranscript) window.renderTranscript();
            }
            if (window.enableTextFallback) window.enableTextFallback();
        } else if (event.error === 'no-speech') {
            // Silently allow onend to restart Speech Recognition so user can speak at their own pace
            console.debug("[SpeechRec] No speech detected. Restarting silently...");
            state.isListening = false;
            updateSpeechUI();
        }
    };

    try {
        state.recognition.start();
        state.isListening = true;
        updateSpeechUI();
    } catch (e) {
        console.error("Failed starting mic session:", e);
        state.isListening = false;
        updateSpeechUI();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Loading & Parsing Helpers
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_PROMPTS = {
    LANGUAGE_RULES: `กฎการสื่อสารและภาษา:
- ปรับภาษาตามคู่สนทนา (พนักงาน) โดยอัตโนมัติ (ไทย/อังกฤษ)
- หากพนักงานสื่อสารภาษาไทย ให้ใช้ภาษาไทย หากสื่อสารภาษาอังกฤษ ให้ใช้ภาษาอังกฤษ และหากคู่สนทนาเปลี่ยนภาษา คุณต้องเปลี่ยนภาษาตามทันทีอย่างราบรื่น`,

    COMMON_RULES: `ข้อมูลพื้นฐานตัวละคร (จากฐานข้อมูล ai_specialists):
- บทบาทหลัก (ai_role): {{ai_role}}
- ชื่อ: {{fullname}}
- เพศ (gender): {{gender}}
- อายุ (age): {{age}} ปี (ปรับน้ำเสียงและบุคลิกให้ตรงกับเพศและช่วงอายุอย่างเหมาะสม เช่น ผู้ใหญ่, วัยรุ่น, ผู้สูงอายุ)
- ตำแหน่ง/อาชีพ (position): {{position}}
- รายละเอียดตัวละครจำลอง (client_details): {{client_details}}
- รายละเอียดเสริมตัวละคร (prompt_text): {{prompt_text}}

แกนหลักและหัวข้อการสนทนา:
- หัวข้อหลักการสนทนา (conversation_topic): {{conversation_topic}}
- ความสนใจของลูกค้า/ผลิตภัณฑ์ (product_interest): {{product_interest}}
- ข้อความเริ่มต้น/ทักทายแรกสุด (initial_message): {{initial_message}}
- ใครเปิดบทสนทนาก่อน (first_speaker): {{first_speaker}}
- คำถามหลักที่ต้องหาโอกาสถามในบทสนทนา (prompt_question): {{prompt_question}}`,

    PRODUCT_SPECIALIST: `คุณรับบทเป็น “ผู้เชี่ยวชาญผลิตภัณฑ์” (Product Specialist) ตามการตั้งค่าในระบบ
ข้อมูลกลุ่มประเมิน (ai_group):
- กลุ่มประเมิน: Product Specialist
- คำอธิบายกลุ่ม: {{groupDesc}}
- Prompt เสริมกลุ่ม: {{groupPrompt}}

{{commonRules}}

ข้อบังคับบทบาทและน้ำเสียง:
1. คุณต้องให้ข้อมูลเชิงลึก ถูกต้อง และชัดเจนเกี่ยวกับผลิตภัณฑ์หรือบริการ อธิบายคุณสมบัติ ประโยชน์ เงื่อนไข และตอบคำถามเชิงเทคนิคอย่างเป็นมืออาชีพ
2. เน้นความถูกต้อง ความชัดเจน และความเป็นมืออาชีพสูงสุด
3. สวมบทบาทให้ตรงกับ เพศ ({{gender}}) และ อายุ ({{age}} ปี)
4. ในบทสนทนา คุณต้องหาจังหวะถามคำถามสำคัญนี้อย่างเป็นธรรมชาติและเหมาะสมตามบทบาทผู้เชี่ยวชาญ: "{{prompt_question}}"`,

    GAME_CHALLENGE: `คุณรับบทเป็น “ผู้ท้าทาย” หรือ “ระบบเกม” (Game Challenge) ตามการตั้งค่าในระบบ
ข้อมูลกลุ่มประเมิน (ai_group):
- กลุ่มประเมิน: Game Challenge
- คำอธิบายกลุ่ม: {{groupDesc}}
- Prompt เสริมกลุ่ม: {{groupPrompt}}

{{commonRules}}

ข้อบังคับบทบาทและน้ำเสียง:
1. คุณมีเป้าหมายเพื่อทดสอบความรู้ ทักษะ หรือการตัดสินใจของพนักงานผู้เล่น
2. ใช้น้ำเสียงที่สนุก ท้าทาย กระตุ้นและดึงดันให้ผู้เล่นตอบหรือแก้ไขข้อโต้แย้งอย่างมีไหวพริบ
3. สวมบทบาทให้ตรงกับ เพศ ({{gender}}) และ อายุ ({{age}}) ปี
4. ในบทสนทนา คุณต้องหาจังหวะถามคำถามหลักตัวนี้เพื่อท้าทายพนักงานขายอย่างเหมาะสม: "{{prompt_question}}"
5. หากพนักงานเสนอเสนอขายผลิตภัณฑ์อื่นที่ไม่ตรงประเด็นหรือไม่กระตุ้นความสนใจในความต้องการของคุณคือ "{{conversation_topic}}" คุณจะต้องพูดปฏิเสธพนักงานโดยมีประโยคปฏิเสธ "ไม่ใช่สิ่งที่ต้องการในขณะนี้" หรือ "นี่ไม่ใช่สิ่งที่ฉันต้องการในตอนนี้นะคะ/ครับ" ในใจความคำตอบโดยทันที`,

    ROLEPLAY: `คุณรับบทเป็น “ลูกค้าจำลอง” หรือ “พนักงานจำลอง” ตามข้อมูลบทบาทที่กำหนดในฟิวด์ ai_role ({{ai_role}})
ข้อมูลกลุ่มประเมิน (ai_group):
- กลุ่มประเมิน: AI Sales Roleplay Simulator (Roleplay)
- คำอธิบายกลุ่ม: {{groupDesc}}
- Prompt เสริมกลุ่ม: {{groupPrompt}}

{{commonRules}}

ข้อบังคับบทบาทและน้ำเสียง:
1. คุณต้องจำลองสถานการณ์การขาย การบริการ หรือการรับมือสถานการณ์ต่าง ๆ เน้นบทสนทนาแบบสมจริง มีอารมณ์ ความคิด และพฤติกรรมเสมือนมนุษย์จริง
2. รักษาบทบาทและตอบสนองตามบทบาทที่กำหนดในฟิวด์ ai_role ({{ai_role}}) อย่างเคร่งครัด
3. ปรับใช้น้ำเสียง บุคลิก และอายุให้ตรงกับ เพศ ({{gender}}) และ อายุ ({{age}}) ปี อย่างสมบูรณ์
4. ในบทสนทนา คุณต้องหาจังหวะนำคำถามหลักตัวนี้มาถามพนักงานอย่างเป็นธรรมชาติ: "{{prompt_question}}"
5. หากพนักงานเสนอเสนอขายผลิตภัณฑ์ที่ไม่ตรงประเด็นหรือไม่เกี่ยวข้องกับความต้องการหลักของคุณคือ "{{conversation_topic}}" คุณต้องหาโอกาสพูดปฏิเสธโดยมีใจความทำนองว่า "ไม่ใช่สิ่งที่ต้องการในขณะนี้" หรือ "นี่ไม่ใช่สิ่งที่ฉันต้องการในตอนนี้นะคะ/ครับ" ในประโยคคำตอบโดยทันที`,

    STRICT_INSTRUCTIONS: `STRICT INSTRUCTIONS:
1. คุณต้องสวมบทบาทตามตัวตนนี้อย่างสมจริง ห้ามหลุดบทบาท AI เด็ดขาด
2. ตอบกลับให้สมจริง สนทนาเหมือนคู่สายจริงทางโทรศัพท์ (สั้นกระชับไม่เกิน 1-2 ประโยคต่อหนึ่งข้อความ)
3. ห้ามใช้สัญลักษณ์ Markdown เปล่าๆ หรืออิโมจิในช่องคำพูดเด็ดขาด เพื่อความลื่นไหลของการแปลงเสียงพูด (TTS)
4. หากคุณได้รับมอบหมายคำถามหลักที่ต้องถาม (prompt_question: "{{prompt_question}}") คุณจะต้องพิจารณาหาโอกาสอันสมควรและพูดคำถามนี้ออกมาในลักษณะที่เป็นธรรมชาติอย่างน้อยหนึ่งครั้งในบทสนทนา

{{languageRules}}`,

    DEFAULT_INSTRUCTION: `คุณคือลูกค้าธนาคารที่พนักงานกำลังโทรเข้ามาเสนอขายผลิตภัณฑ์ทางการเงิน
เป้าหมายของพนักงานคือการนำเสนอขาย: {{productName}} ({{productDesc}})
บุคลิกและลักษณะนิสัยของคุณคือ: {{personaName}} ({{personaDesc}})

กฎการตอบสนอง:
1. ตอบกลับด้วยความสมจริง มีชีวิตชีวา และสั้นกระชับสำหรับคุยโทรศัพท์จริง (ไม่เกิน 1-2 ประโยคต่อหนึ่งข้อความ)
2. มีน้ำเสียงตามอารมณ์และนิสัยที่เลือก และสลักคำพูดแสนไพเราะน่าฟัง
3. พยายามซักถาม โต้แย้งด้วยความลังเล หรือไม่มั่นใจเกี่ยวกับผลิตภัณฑ์นี้ โดยอ้างอิงจากนิสัยที่พนักงานเลือก
4. ให้พนักงานพยายามเสนอสิทธิประโยชน์ หรือแก้ไขข้อวิตกจนสมบูรณ์แบบ จึงตกลงยอมรับการขายในตอนท้าย
5. ห้ามใช้อีโมจิหรือสัญลักษณ์ Markdown เปล่าๆ ปรากฏในคำตอบเพื่อให้เครื่องผลิตคำพูดอ่านได้อย่างถูกต้อง`
};

async function fetchAndParsePrompts() {
    try {
        const response = await fetch('ai_agent_prompts.txt');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const sections = {};
        const parts = text.split(/===\s*SECTION:\s*([A-Z_]+)\s*===/g);
        for (let i = 1; i < parts.length; i += 2) {
            const sectionName = parts[i].trim();
            const sectionContent = parts[i + 1] ? parts[i + 1].trim() : "";
            sections[sectionName] = sectionContent;
        }
        return sections;
    } catch (e) {
        console.warn("[Prompts] Failed to fetch ai_agent_prompts.txt, using hardcoded fallback:", e);
        return null;
    }
}

function renderTemplate(template, vars) {
    if (!template) return "";
    let rendered = template;
    for (const key in vars) {
        const val = vars[key] === undefined || vars[key] === null ? "" : vars[key];
        rendered = rendered.split(`{{${key}}}`).join(val);
    }
    return rendered;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX #4 — handleUserSpeech with Streaming Text Generation
// Uses streamGenerateContent to receive text tokens faster, reducing
// total round-trip latency before TTS even begins.
// ─────────────────────────────────────────────────────────────────────────────

export async function handleUserSpeech(userText) {
    if (!userText.trim()) return;

    // Stop current listening + any in-flight requests immediately
    if (state.recognition) {
        try {
            state.recognition.onresult = null;
            state.recognition.onerror  = null;
            state.recognition.onend    = null;
            state.recognition.abort();
        } catch (e) {}
        state.recognition = null;
    }
    state.isListening = false;
    abortPreviousRequests();
    updateSpeechUI();

    state.transcriptHistory.push({ role: 'user', text: userText });
    if (window.renderTranscript) window.renderTranscript();

    // ── Build system instruction from external file ──────────────────────────
    let systemInstruction = "";

    const filePrompts = await fetchAndParsePrompts();
    const prompts = filePrompts || FALLBACK_PROMPTS;

    if (state.isExecutiveAssistant) {
        const assistantName = state.currentGender === 'male' ? 'คุณวรุตม์' : 'คุณกนกวรรณ';
        const assistantGender = state.currentGender === 'male' ? 'ชาย' : 'หญิง';
        systemInstruction = `คุณคือผู้ช่วยบริหารระดับสูง (AI Executive Assistant) ของธนาคารทหารไทยธนชาต (ttb) ชื่อ ${assistantName} เพศ ${assistantGender} มีหน้าที่ให้คำปรึกษา แนะนำด้านกลยุทธ์ วิเคราะห์ความเสี่ยง และโอกาสทางธุรกิจของธนาคารแก่ผู้บริหาร
กฎการสื่อสารและภาษา:
- ตอบคำถามและให้ข้อมูลอย่างเป็นมืออาชีพ มีความรอบรู้ระดับที่ปรึกษา McKinsey
- สนทนาโต้ตอบอย่างต่อเนื่อง สมจริง เป็นมิตร แต่สุภาพและมีความน่าเชื่อถือสูง
- ตอบกลับค่อนข้างกระชับ (ประมาณ 1-3 ประโยค) เพื่อให้เหมาะกับการคุยโต้ตอบและแปลงเป็นเสียงพูด (TTS) ได้อย่างลื่นไหล
- ห้ามใช้อีโมจิหรือสัญลักษณ์ Markdown เปล่าๆ ในช่องคำพูดเด็ดขาด เพื่อป้องกันการอ่านออกเสียงที่ผิดพลาด`;
    } else if (state.currentActiveSpecialist) {
        const spec = state.currentActiveSpecialist;
        const parentGroup = (spec && window.groupsMap) ? window.groupsMap[spec.parentId] : null;
        const groupName = parentGroup ? (parentGroup.namegroup || '') : '';
        const groupDesc = parentGroup ? (parentGroup.description || '') : '';
        const groupPrompt = parentGroup ? (parentGroup.group_prompt || '') : '';

        const langRulesTemplate = prompts.LANGUAGE_RULES || FALLBACK_PROMPTS.LANGUAGE_RULES;
        const commonRulesTemplate = prompts.COMMON_RULES || FALLBACK_PROMPTS.COMMON_RULES;
        const strictInstrTemplate = prompts.STRICT_INSTRUCTIONS || FALLBACK_PROMPTS.STRICT_INSTRUCTIONS;

        const languageRules = renderTemplate(langRulesTemplate, {});
        const commonRules = renderTemplate(commonRulesTemplate, {
            ai_role: spec.ai_role || 'ลูกค้า',
            fullname: spec.fullname || 'ทั่วไป',
            gender: spec.gender || 'หญิง',
            age: spec.age || '35',
            position: spec.position || 'ทั่วไป',
            client_details: spec.client_details || '-',
            prompt_text: spec.prompt_text || '',
            conversation_topic: spec.conversation_topic || '-',
            product_interest: spec.product_interest || '-',
            initial_message: spec.initial_message || '',
            first_speaker: spec.first_speaker || 'พนักงาน',
            prompt_question: spec.prompt_question || ''
        });

        let roleSpecificTemplate = "";
        if (groupName.includes("Product Specialist") || spec.isProductSpecialist) {
            roleSpecificTemplate = prompts.PRODUCT_SPECIALIST || FALLBACK_PROMPTS.PRODUCT_SPECIALIST;
        } else if (groupName.includes("Game Challenge") || spec.isGameChallenge) {
            roleSpecificTemplate = prompts.GAME_CHALLENGE || FALLBACK_PROMPTS.GAME_CHALLENGE;
        } else {
            roleSpecificTemplate = prompts.ROLEPLAY || FALLBACK_PROMPTS.ROLEPLAY;
        }

        const roleSpecificInstructions = renderTemplate(roleSpecificTemplate, {
            groupDesc,
            groupPrompt,
            commonRules,
            gender: spec.gender || 'หญิง',
            age: spec.age || '35',
            prompt_question: spec.prompt_question || '',
            conversation_topic: spec.conversation_topic || '-'
        });

        const strictInstructions = renderTemplate(strictInstrTemplate, {
            prompt_question: spec.prompt_question || '',
            languageRules
        });

        systemInstruction = roleSpecificInstructions + "\n\n" + strictInstructions;
    } else {
        const productObj = PRODUCTS[state.selectedProduct];
        const personaObj = PERSONAS[state.selectedPersona];
        const defaultTemplate = prompts.DEFAULT_INSTRUCTION || FALLBACK_PROMPTS.DEFAULT_INSTRUCTION;

        systemInstruction = renderTemplate(defaultTemplate, {
            productName: productObj.name,
            productDesc: productObj.desc,
            personaName: personaObj.name,
            personaDesc: personaObj.desc
        });
    }

        const contents = state.transcriptHistory
        .filter(t => t.role !== 'system')
        .map(t => ({ role: t.role, parts: [{ text: t.text }] }));

    try {
        const activeKey = getActiveTtsKey();
        if (!activeKey) throw new Error("กรุณากรอก API Key ก่อน");

        // ── Streaming text generation ────────────────────────────────────────
        const llmAbort = new AbortController();
        state.llmAbortController = llmAbort;

        // ── Fix #8: Disable thinking budget for conversational roleplay turns.
        // Gemini 2.5 Flash's reasoning chain adds ~2-5s latency that roleplay
        // responses don't benefit from (1-2 sentence answers don't need deep reasoning).
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${activeKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents,
                generationConfig: {
                    thinkingConfig: { thinkingBudget: 0 }
                }
            }),
            signal: llmAbort.signal
        });

        if (!response.ok) {
            if (response.status === 429) {
                markKeyExhausted(activeKey);
            }
            const errRes = await response.json().catch(() => ({}));
            throw new Error(errRes?.error?.message || `HTTP ${response.status}`);
        }

        let aiText = '';
        for await (const json of readSSEStream(response)) {
            if (llmAbort.signal.aborted) break;
            const textPart = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) aiText += textPart;
        }

        if (!aiText.trim()) throw new Error("LLM stream returned empty text");

        state.transcriptHistory.push({ role: 'model', text: aiText });
        if (window.renderTranscript) window.renderTranscript();

        // ── Voice mapping ────────────────────────────────────────────────────
        let customVoice = null;
        let customRate  = null;
        let customPitch = null;

        // ── Fix #10: Use shared getVoiceParams helper — no more duplicated mapping logic
        if (state.currentActiveSpecialist) {
            const vp = getVoiceParams(state.currentActiveSpecialist);
            customVoice = vp.voice;
            customRate  = vp.rate;
            customPitch = vp.pitch;
        }

        speakText(aiText, customVoice, customRate, customPitch);

    } catch (err) {
        if (err.name === 'AbortError') {
            console.debug("[LLM] Request aborted — user spoke again.");
            return;
        }
        console.error("AI Text Generation Error:", err);
        if (window.showDebugError) window.showDebugError("Gemini Content Error: " + err.message);

        const fallbackText = "เมื่อกี้สัญญาณเหมือนจะขาดหายไปนิดนึงค่ะ รบกวนคุณพนักงานทวนรายละเอียดอีกครั้งได้ไหมคะ?";
        state.transcriptHistory.push({ role: 'model', text: fallbackText });
        if (window.renderTranscript) window.renderTranscript();
        speakText(fallbackText);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mute / UI helpers (unchanged logic, preserved)
// ─────────────────────────────────────────────────────────────────────────────

export function toggleMute() {
    state.isMuted = !state.isMuted;
    updateSpeechUI();

    if (state.isMuted) {
        if (state.recognition) {
            try {
                state.recognition.onresult = null;
                state.recognition.onerror  = null;
                state.recognition.onend    = null;
                state.recognition.abort();
            } catch (e) {}
            state.recognition = null;
        }
        state.isListening = false;
        updateSpeechUI();
    } else {
        if (!state.isSpeaking) startListening();
    }
}

export function updateSpeechUI() {
    // ── ttb AI Executive Assistant UI Updates ──
    const aiSpeakingStatus = document.getElementById('ai-speaking-status');
    const aiStatusDot = document.getElementById('ai-status-dot');
    const chatListeningIndicator = document.getElementById('chat-listening-indicator');

    if (aiSpeakingStatus) {
        if (state.isSpeaking) {
            aiSpeakingStatus.innerText = "ผู้ช่วย AI กำลังพูดตอบกลับ...";
            if (aiStatusDot) aiStatusDot.className = "h-2 w-2 rounded-full bg-ttbOrange animate-pulse";
        } else if (state.isListening) {
            aiSpeakingStatus.innerText = "กำลังรับฟัง... เชิญท่านผู้บริหารพูดได้เลยค่ะ";
            if (aiStatusDot) aiStatusDot.className = "h-2 w-2 rounded-full bg-purple-500 animate-pulse";
        } else {
            if (state.isConnected) {
                aiSpeakingStatus.innerText = "เชื่อมต่อระบบสนทนาสดแล้ว พร้อมคุยกับคุณค่ะ";
                if (aiStatusDot) aiStatusDot.className = "h-2 w-2 rounded-full bg-emerald-500 animate-pulse";
            } else {
                aiSpeakingStatus.innerText = "ผู้ช่วย AI พร้อมนำเสนอสรุปความเห็นเชิงรุก";
                if (aiStatusDot) aiStatusDot.className = "h-2 w-2 rounded-full bg-emerald-500 animate-pulse";
            }
        }
    }

    if (chatListeningIndicator) {
        if (state.isSpeaking) {
            chatListeningIndicator.classList.remove('hidden');
            chatListeningIndicator.className = "flex items-center gap-1.5 px-2.5 py-1 bg-ttbOrange/20 text-ttbOrange rounded-full text-[9px] border border-ttbOrange/30";
            chatListeningIndicator.innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-ttbOrange animate-pulse"></span><span>AI กำลังพูด...</span>`;
        } else if (state.isListening) {
            chatListeningIndicator.classList.remove('hidden');
            chatListeningIndicator.className = "flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded-full text-[9px] border border-purple-500/30";
            chatListeningIndicator.innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse"></span><span>กำลังฟัง...</span>`;
        } else {
            chatListeningIndicator.classList.add('hidden');
        }
    }

    const glow        = document.getElementById('avatar-glow');
    const circle      = document.getElementById('avatar-circle');
    const indicator   = document.getElementById('speech-indicator');
    const muteBtn     = document.getElementById('mute-btn');
    const visualizer  = document.getElementById('voice-visualizer');
    const interruptBtn = document.getElementById('interrupt-btn');

    // ── Interrupt button + mic-lock label: visible ONLY while AI is speaking ──
    if (interruptBtn) {
        if (state.isSpeaking) {
            interruptBtn.classList.remove('opacity-0', 'pointer-events-none', 'scale-90');
            interruptBtn.classList.add('opacity-100', 'scale-100');
        } else {
            interruptBtn.classList.add('opacity-0', 'pointer-events-none', 'scale-90');
            interruptBtn.classList.remove('opacity-100', 'scale-100');
        }
    }
    const micLockLabel = document.getElementById('mic-lock-label');
    if (micLockLabel) {
        if (state.isSpeaking) {
            micLockLabel.classList.remove('hidden');
            micLockLabel.classList.add('flex');
        } else {
            micLockLabel.classList.add('hidden');
            micLockLabel.classList.remove('flex');
        }
    }

    // ── Mute button: dim + locked appearance while AI is speaking ────────────
    if (muteBtn) {
        if (state.isSpeaking) {
            // Locked state: mic visually disabled to show it's not capturing
            muteBtn.className = "w-14 h-14 rounded-full flex items-center justify-center bg-slate-800 text-slate-600 border border-slate-700 opacity-50 cursor-not-allowed transition-all";
            muteBtn.innerHTML = `<i data-lucide="mic-off" class="w-6 h-6"></i>`;
            muteBtn.setAttribute('disabled', 'true');
        } else if (state.isMuted) {
            muteBtn.className = "w-14 h-14 rounded-full flex items-center justify-center bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-lg shadow-rose-950/20 animate-pulse cursor-pointer transition-all";
            muteBtn.innerHTML = `<i data-lucide="mic-off" class="w-6 h-6"></i>`;
            muteBtn.removeAttribute('disabled');
        } else {
            muteBtn.className = "w-14 h-14 rounded-full bg-slate-700 text-white hover:bg-slate-600 border border-slate-600 flex items-center justify-center transition-all cursor-pointer";
            muteBtn.innerHTML = `<i data-lucide="mic" class="w-6 h-6"></i>`;
            muteBtn.removeAttribute('disabled');
        }
    }

    const ripple1 = document.getElementById('avatar-speaking-waves');
    const ripple2 = document.getElementById('avatar-speaking-waves-outer');
    if (ripple1 && ripple2) {
        if (state.isSpeaking) {
            ripple1.classList.remove('hidden');
            ripple1.classList.add('speaking-ripple');
            ripple2.classList.remove('hidden');
            ripple2.classList.add('speaking-ripple-delayed');
        } else {
            ripple1.classList.add('hidden');
            ripple1.classList.remove('speaking-ripple');
            ripple2.classList.add('hidden');
            ripple2.classList.remove('speaking-ripple-delayed');
        }
    }

    if (glow && circle && indicator && visualizer) {
        if (state.isSpeaking) {
            glow.className      = "absolute inset-0 rounded-full blur-2xl opacity-50 bg-sky-500 animate-pulse";
            circle.className    = "w-44 h-44 rounded-full border-4 border-sky-400 bg-slate-800 flex items-center justify-center relative z-10 shadow-xl scale-105 transition-all duration-300 overflow-hidden";
            indicator.className = "text-sky-300 font-light flex items-center gap-1.5";
            indicator.innerHTML = `<i data-lucide="volume-2" class="w-3.5 h-3.5 animate-pulse"></i> ลูกค้ากำลังพูด...`;
            visualizer.classList.remove('hidden');
            visualizer.classList.add('flex');
        } else if (state.isListening) {
            glow.className      = "absolute inset-0 rounded-full blur-2xl opacity-40 bg-purple-500 animate-pulse";
            circle.className    = "w-44 h-44 rounded-full border-4 border-slate-700 bg-slate-800 flex items-center justify-center relative z-10 shadow-xl transition-all duration-300 overflow-hidden";
            indicator.className = "text-purple-300 font-light flex items-center gap-1.5 animate-pulse";
            indicator.innerHTML = `<i data-lucide="mic" class="w-3.5 h-3.5"></i> เชิญพนักงานเสนอขายได้เลย...`;
            visualizer.classList.add('hidden');
            visualizer.classList.remove('flex');
        } else {
            glow.className      = "absolute inset-0 rounded-full blur-2xl opacity-20 bg-slate-700";
            circle.className    = "w-44 h-44 rounded-full border-4 border-slate-700 bg-slate-800 flex items-center justify-center relative z-10 shadow-xl transition-all duration-300 overflow-hidden";
            indicator.className = "text-slate-500 font-light";
            indicator.textContent = "กำลังวิเคราะห์ข้อมูล...";
            visualizer.classList.add('hidden');
            visualizer.classList.remove('flex');
        }
    }

    if (window.lucide) window.lucide.createIcons();
}
