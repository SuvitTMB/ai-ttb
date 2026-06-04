export const PRODUCTS = {
    credit_card: { name: 'บัตรเครดิต (Credit Card)', desc: 'เน้นสิทธิประโยชน์ Cashback และสะสมไมล์' },
    personal_loan: { name: 'สินเชื่อส่วนบุคคล (Personal Loan)', desc: 'ดอกเบี้ยต่ำ อนุมัติไว ไม่ต้องมีคนค้ำ' },
    insurance: { name: 'ประกันชีวิตควบการลงทุน (Unit Linked)', desc: 'คุ้มครองชีวิตพร้อมโอกาสรับผลตอบแทน' }
};

export const PERSONAS = {
    curious: { name: 'ลูกค้าขี้สงสัย', desc: 'ถามรายละเอียดเยอะ เปรียบเทียบดอกเบี้ย' },
    hurry: { name: 'ลูกค้ารีบร้อน', desc: 'ต้องการเนื้อเน้นๆ รำคาญถ้าน้ำเยอะ' },
    hesitant: { name: 'ลูกค้าลังเล', desc: 'กลัวความเสี่ยง ปฏิเสธไว้ก่อน ต้องโน้มน้าวเก่ง' }
};

export const state = window.state || {
    selectedProduct: 'credit_card',
    selectedPersona: 'curious',
    isConnected: false,
    isMuted: false,
    isSpeaking: false,
    isListening: false,
    isAudioUnlocked: false,
    useLocalTts: false, // Set to false to use Gemini TTS by default

    isExecutiveAssistant: true,
    currentGender: 'female',
    currentStyle: '3d',

    geminiApiKey: 'AIzaSyBUsU-7UGuPWQXT_yAs8d3kQGyeIxPkhGs',

    // ── Multi-Key TTS Rotation ──────────────────────────────────────────────
    ttsApiKeys: [],
    ttsKeyIndex: 0,
    ttsExhaustedKeys: new Set(),
    // ────────────────────────────────────────────────────────────────────────

    transcriptHistory: [],
    recognition: null,
    audioStream: null,
    audioCtx: null,
    activeAudioSource: null,

    currentActiveSpecialist: null,
    activeCriteria: [],
    completedSpecialists: {},

    // Streaming Audio State
    ttsAbortController: null,
    llmAbortController: null,
    audioQueue: null,
    greetingAudioCache: new Map(),
    warmupAbortController: null
};

if (!window.state) {
    window.state = state;
}
