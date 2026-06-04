import { speakText, initTtsKeys, startListening, interruptAI, handleUserSpeech } from "./audio-service.js";
import { state } from "./state.js";

// Data base populated by rules extracted directly from "AIExecutiveAssistant.txt"
const STRATEGIC_DATABASE = {
    news: {
        title: "สรุปยุทธศาสตร์ประจำวัน",
        tag: "Competitive Outlook",
        tagClass: "text-[9px] font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full uppercase tracking-wider",
        headline: "กลุ่มพันธมิตรยักษ์ใหญ่ร่วมมือยื่นใบอนุญาต Virtual Bank เขย่าพอร์ตลูกค้ารายย่อย ttb",
        summary: "ธปท. เตรียมเปิดรับสมัครใบขอรับใบอนุญาต Virtual Bank รอบแรก คาดว่าคู่แข่งที่มีฐานผู้ใช้ระบบนิเวศน์ทางเทคโนโลยีจะเข้ามาชิงฐานเงินฝาก และเสนอนวัตกรรมปล่อยกู้ดิจิทัลที่มีต้นทุนบริหารที่ต่ำกว่าธนาคารดั้งเดิมอย่างมีนัยสำคัญ",
        insight: "การต่อสู้ระยะยาวจะถูกกำหนดด้วยความสามารถในการผูกมัดไลฟ์สไตล์ของลูกค้าผ่าน Embedded Finance และอัตราผลตอบแทนเชิงลึก",
        why: "โมเดลไร้สาขาทำให้พวกเขาสามารถกระจายผลประโยชน์ไปเป็นแคมเปญดอกเบี้ยดึงดูดลูกค้าและจัดเก็บค่าธรรมเนียมการดำเนินงานที่ต่ำมาก",
        impact: "เสี่ยงกระทบปริมาณเงินฝากออมทรัพย์ดอกเบี้ยต่ำ (CASA) ของ ttb ตลอดจนท้าทายระบบสินเชื่อรถยนต์และรายย่อยที่เป็นกระดูกสันหลัง",
        action: "ผสานขีดความสามารถการบริการของแอป 'ttb touch' กับคู่ค้ากลุ่มค้าปลีกขนาดใหญ่ และเร่งพัฒนาการปล่อยวงเงินกู้อเนกประสงค์แบบตอบรับเร็วบนหน้าแอปพลิเคชัน",
        speech: {
            male: "สวัสดีครับท่านผู้บริหาร สำหรับสรุปยุทธศาสตร์รอบเช้านี้ ความคืบหน้าเรื่องใบอนุญาตจัดตั้ง เวอร์ชวล แบงก์ เป็นเรื่องเร่งด่วนที่สุดครับ คู่แข่งรอบใหม่นี้ มีขีดความสามารถในการจัดเก็บต้นทุนการดำเนินงานที่ต่ำกว่าเรามาก ขอเสนอแนะให้เร่งเชื่อมต่อโครงข่าย ttb touch เข้ากับห้างค้าปลีกชั้นนำ เพื่อรักษาสิทธิประโยชน์ และกุมความได้เปรียบด้านความสัมพันธ์กับลูกค้าหลักของเราครับ",
            female: "สวัสดีค่ะท่านผู้บริหาร สำหรับสรุปด้านยุทธศาสตร์วันนี้ ความคืบหน้าของเวอร์ชวล แบงก์ กำลังดึงดูดความสนใจของผู้บริโภคเป็นอย่างมาก เนื่องจากมีความพร้อมด้านเทคโนโลยีและต้นทุนที่ยืดหยุ่นกว่า ทางกนกวรรณขอแนะนำให้ยกระดับแอปพลิเคชัน ttb touch เพื่อมอบประสบการณ์การสะสมสิทธิ์และสร้างสิทธิประโยชน์เงินออมที่ตรงใจยิ่งขึ้น เพื่อป้องกันการย้ายค่ายของลูกค้ารายย่อยค่ะ"
        }
    },
    risk: {
        title: "วิเคราะห์ความเสี่ยงเชิงรุก",
        tag: "Risk Assessment",
        tagClass: "text-[9px] font-bold bg-rose-100 text-rose-700 px-3 py-1 rounded-full uppercase tracking-wider",
        headline: "ประเมินหนี้ครัวเรือนพุ่งพ่วงสัดส่วน NPL ในกลุ่มผลิตภัณฑ์สินเชื่อส่วนบุคคลและสินเชื่อรถยนต์",
        summary: "เกณฑ์ข้อบังคับควบคุมความรับผิดชอบในการปล่อยกู้ หรือ Responsible Lending ของ ธปท. เตรียมปรับใช้อย่างเต็มระบบ ส่งผลให้การควบคุมภาระหนี้ต่อรายได้มีความเข้มข้นยิ่งขึ้น ส่งสัญญาณการชะลอตัวของยอดปล่อยวงเงินใหม่",
        insight: "สถาบันการเงินจำเป็นต้องคัดกรองลูกหนี้ที่มีคุณภาพสูง พร้อมผันเป้าหมายผลิตภัณฑ์เป็นกลุ่มช่วยลดภาระหนี้แทนการปล่อยกู้ฟุ่มเฟือย",
        why: "หากควบคุมไม่ทันท่วงที ค่าเผื่อหนี้สูญและค่าใช้จ่ายสำรองเครดิตในไตรมาสถัดๆ ไป จะกดดันผลตอบแทนกำไรสะสมสุทธิ (NIM) ของเราอย่างรุนแรง",
        impact: "เป้าหมายการเติบโตของกลุ่มสินเชื่อเงินด่วนส่วนบุคคลชะลอตัวลง จำเป็นต้องหาโซลูชันทดแทนด่วน",
        action: "ส่งเสริมและเร่งทำตลาดแพ็กเกจ 'สินเชื่อรวมหนี้ (ttb Debt Consolidation)' เพื่อช่วยกู้เสถียรภาพทางการเงินของลูกค้าควบคู่ไปกับการรักษาความเสี่ยงต่ำ",
        speech: {
            male: "รายงานประเมินความเสี่ยงเชิงรุกครับท่าน สัดส่วนหนี้ครัวเรือนที่สูงขึ้น ร่วมกับกฎเกณฑ์รีสปอนซิบิล เลนดิ้ง จะท้าทายยอดเติบโตสินเชื่อรายย่อยอย่างมากครับ แนะนำให้เราหันมาผลักดันแคมเปญการรวบรวมหนี้เป็นเป้าหมายหลัก เพื่อช่วยลดภาระดอกเบี้ยของลูกค้า และกรองพอร์ตหนี้เสียไปพร้อมๆ กันครับ",
            female: "รายงานสรุปด้านความเสี่ยงและความมั่นคงค่ะ สัดส่วนหนี้ค้างชำระมีแรงกดดันมากขึ้น กนกวรรณเห็นว่า แคมเปญสินเชื่อรวมหนี้ หรือเดปต์ คอนโซลิเดชัน เป็นเครื่องมือที่ดีที่สุดในตอนนี้ค่ะ เพราะนอกจากจะช่วยเพิ่มความผูกพันและคะแนนความเชื่อถือจากลูกค้าแล้ว ยังช่วยให้ ttb ควบคุมคุณภาพหนี้ให้อยู่ในกรอบที่ระบุไว้อย่างปลอดภัยค่ะ"
        }
    },
    opp: {
        title: "วิเคราะห์โอกาสทางธุรกิจใหม่",
        tag: "Growth Window",
        tagClass: "text-[9px] font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full uppercase tracking-wider",
        headline: "การขยายตัวของกลุ่มนวัตกรรม Green Financing และพันธมิตร Embedded Lifestyle Commerce",
        summary: "ผู้บริโภคระดับกลางถึงสูงและองค์กรขนาดใหญ่หันมาให้ความสนใจกับผลิตภัณฑ์เพื่อความยั่งยืนทางการเงิน (ESG) และสินเชื่อสีเขียวอย่างต่อเนื่อง เป็นกลุ่มตลาดมูลค่าเพิ่มที่มีการแข่งขันต่ำและได้สิทธิประโยชน์เชิงภาษี",
        insight: "แบรนด์ ttb สามารถเข้ายึดหัวหาดความเป็นผู้นำทางด้าน ESG Financial Partner ได้อย่างยั่งยืนผ่านแคมเปญสนับสนุนผู้ประกอบการและรถไฟฟ้า",
        why: "ช่วยขยายพอร์ตโฟลิโอผลิตภัณฑ์ที่มีเสถียรภาพสูง และสามารถทำ Cross-selling บริการเสริมทางธุรกิจอื่นๆ แก่องค์กรขนาดใหญ่ไปในตัว",
        impact: "เพิ่มรายได้ที่มิใช่ดอกเบี้ย ยกระดับสัญญารูปแบบ ESG และสะท้อนภาพลักษณ์แบรนด์ทางการเงินระดับพรีเมียม",
        action: "ปล่อยโปรแกรมดอกเบี้ยพิเศษแบบผ่อนปรนสำหรับโรงงานผู้เปลี่ยนผ่านสู่แผงโซลาร์เซลล์ และผู้สั่งซื้อยานยนต์ไฟฟ้าในพอร์ตสินเชื่อรถยนต์ชั้นนำ",
        speech: {
            male: "สำหรับโอกาสดีๆ วันนี้ ผลิตภัณฑ์เพื่อสิ่งแวดล้อมหรืออีเอสจี ได้รับเสียงตอบรับที่สูงมากจากคู่ค้าองค์กรรายใหญ่ครับ นี่คือทางผ่านสำคัญที่จะช่วยเปิดพอร์ตสินเชื่อชั้นดีความเสี่ยงต่ำ แนะนำให้ปล่อยผลิตภัณฑ์สนับสนุนกลุ่มลูกค้าโรงงานปรับระบบพลังงานสะอาดโดยทันทีครับ",
            female: "รายงานโอกาสเติบโตเชิงบวกค่ะ ตลาดสินเชื่อสีเขียวและกลุ่มยานยนต์ไฟฟ้ากำลังเป็นเมกะเทรนด์ที่สร้างความได้เปรียบอย่างโดดเด่น กนกวรรณขอเสนอแนะให้เร่งเจรจากับผู้แทนจำหน่ายยานยนต์ไฟฟ้า เพื่อส่งแคมเปญสินเชื่อสีเขียวอัตราพิเศษก่อนช่วงการเข้าถึงของคู่แข่งในตลาดค่ะ"
        }
    }
};

let currentGender = 'female'; // Default is female (Kanokwan)
let currentStyle = '3d'; // Default is 3D Vector
let currentSelectedCategory = null; // Store currently selected intelligence category
let isMovingMouth = false;
let mouthInterval = null;

// Photo avatars mappings
const PHOTO_AVATARS = {
    male: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=600",
    female: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600"
};

window.addEventListener('load', () => {
    initTtsKeys(); // Initialize Gemini API Keys
    initSpeech();
    updateLiveTime();
    // Automatically pre-load welcome view
    resetBriefingPanel();
});

function initSpeech() {
    // Initial audio context unlock will be handled by user gestures
}

function updateLiveTime() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    document.getElementById('live-time').innerHTML = `Live Mode | ${hours}:${minutes} ${ampm}`;
}

function setGender(gender) {
    currentGender = gender;
    state.currentGender = gender;
    
    // Adjust gender buttons look (Premium dark glass matching style)
    const btnFemale = document.getElementById('btn-gender-female');
    const btnMale = document.getElementById('btn-gender-male');
    
    if (gender === 'female') {
        btnFemale.className = "text-[10px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-ttbBlue to-ttbBlue/85 shadow-md text-white transition-all flex items-center gap-1";
        btnMale.className = "text-[10px] font-bold px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1";
    } else {
        btnMale.className = "text-[10px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-ttbBlue to-ttbBlue/85 shadow-md text-white transition-all flex items-center gap-1";
        btnFemale.className = "text-[10px] font-bold px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1";
    }

    // Sync visual display
    syncAvatarDisplay();

    // Speak switch alert short
    const alertText = gender === 'female' 
        ? "ดิฉัน กนกวรรณ พร้อมบรรยายสรุปเคียงข้างคุณค่ะ" 
        : "ผม วรุตม์ ยินดีเตรียมเสนอข้อมูลรายงานอย่างเข้มข้นครับ";
    
    speakWithMouthSync(alertText);
}

function setRenderStyle(style) {
    currentStyle = style;
    state.currentStyle = style;
    
    const btn3d = document.getElementById('btn-style-3d');
    const btnPhoto = document.getElementById('btn-style-photo');
    
    if (style === '3d') {
        btn3d.className = "text-[10px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-ttbBlue to-ttbBlue/85 shadow-md text-white transition-all";
        btnPhoto.className = "text-[10px] font-bold px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all";
    } else {
        btnPhoto.className = "text-[10px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-ttbBlue to-ttbBlue/85 shadow-md text-white transition-all";
        btn3d.className = "text-[10px] font-bold px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all";
    }

    syncAvatarDisplay();
}

function syncAvatarDisplay() {
    const svgFemale = document.getElementById('avatar-svg-female');
    const svgMale = document.getElementById('avatar-svg-male');
    const photoContainer = document.getElementById('avatar-photo-container');
    const photoImg = document.getElementById('avatar-photo-img');

    if (currentStyle === '3d') {
        photoContainer.classList.add('hidden');
        photoContainer.classList.remove('flex');
        if (currentGender === 'female') {
            svgFemale.classList.remove('hidden');
            svgFemale.classList.add('flex');
            svgMale.classList.add('hidden');
        } else {
            svgMale.classList.remove('hidden');
            svgMale.classList.add('flex');
            svgFemale.classList.add('hidden');
        }
    } else {
        svgFemale.classList.add('hidden');
        svgMale.classList.add('hidden');
        photoContainer.classList.remove('hidden');
        photoContainer.classList.add('flex');
        
        // Set photo source based on chosen gender
        photoImg.src = PHOTO_AVATARS[currentGender];
    }
}

function toggleMute() {
    state.isMuted = !state.isMuted;
    const icon = document.getElementById('volume-mute-icon');
    const btn = document.getElementById('volume-mute-btn');
    
    if (state.isMuted) {
        icon.className = "fa-solid fa-volume-xmark text-xs";
        btn.className = "h-8 w-8 flex items-center justify-center rounded-full bg-rose-950/40 text-rose-400 hover:bg-rose-900/40 transition-all shadow-sm border border-rose-500/30";
        
        // Abort current audio-service request or active playback
        if (state.ttsAbortController) {
            state.ttsAbortController.abort();
            state.ttsAbortController = null;
        }
        if (state.audioQueue) {
            state.audioQueue.stop();
            state.audioQueue = null;
        }
        if (state.activeAudioSource) {
            try { state.activeAudioSource.stop(); } catch (e) {}
            state.activeAudioSource = null;
        }
        
        stopMouthAnimation();
    } else {
        icon.className = "fa-solid fa-volume-high text-xs";
        btn.className = "h-8 w-8 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-all shadow-sm active:scale-95";
    }
}

function resetBriefingPanel() {
    closeBriefingDrawer();
}

function openBriefingDrawer() {
    const drawer = document.getElementById('briefing-drawer');
    if (drawer) {
        drawer.classList.remove('translate-x-full');
        drawer.classList.add('translate-x-0');
        const overlay = document.getElementById('briefing-drawer-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('block');
        }
    }
}

function closeBriefingDrawer() {
    const drawer = document.getElementById('briefing-drawer');
    if (drawer) {
        drawer.classList.add('translate-x-full');
        drawer.classList.remove('translate-x-0');
        const overlay = document.getElementById('briefing-drawer-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('block');
        }
    }
}

// Trigger Intelligence Reports
function triggerIntelligence(category) {
    currentSelectedCategory = category;
    const data = STRATEGIC_DATABASE[category];
    
    // Switch Briefing Cards to active
    document.getElementById('briefing-welcome-card').classList.add('hidden');
    document.getElementById('briefing-active-card').classList.remove('hidden');
    
    // Populate fields
    document.getElementById('briefing-title-header').innerText = data.title;
    const pill = document.getElementById('briefing-pill');
    pill.innerText = data.tag;
    pill.className = data.tagClass;
    
    document.getElementById('active-headline').innerText = data.headline;
    document.getElementById('active-summary').innerText = data.summary;
    document.getElementById('active-insight').innerText = data.insight;
    document.getElementById('active-why').innerText = data.why;
    document.getElementById('active-impact').innerText = data.impact;
    document.getElementById('active-action').innerText = data.action;

    // Scroll sidepanel smoothly to top to focus
    document.getElementById('briefing-info-scroller').scrollTop = 0;

    // Slide drawer open
    openBriefingDrawer();

    // Voice synthesis speech trigger (Adjusted with correct gender speech selection)
    const chosenSpeech = currentGender === 'female' ? data.speech.female : data.speech.male;
    speakWithMouthSync(chosenSpeech);
}

function simulateBriefingSpeech() {
    if (!currentSelectedCategory) {
        // If nothing is selected, trigger basic default welcome greeting
        const defaultSpeech = currentGender === 'female' 
            ? "สวัสดีค่ะท่านผู้บริหาร กนกวรรณยินดีต้อนรับเข้าสู่ระบบรายงานความเห็นแผนยุทธศาสตร์ค่ะ โปรดเลือกหัวข้อรายงานด่วนด้านล่างได้เลยค่ะ" 
            : "สวัสดีครับท่านผู้บริหาร ผมวรุตม์พร้อมแล้วครับสำหรับการรายงานแผนยุทธศาสตร์และข้อมูลเชิงรุกของวันนี้ เลือกรายงานด้านล่างได้เลยครับ";
        speakWithMouthSync(defaultSpeech);
    } else {
        const data = STRATEGIC_DATABASE[currentSelectedCategory];
        const chosenSpeech = currentGender === 'female' ? data.speech.female : data.speech.male;
        speakWithMouthSync(chosenSpeech);
    }
}

async function speakWithMouthSync(text) {
    stopMouthAnimation();

    const bubble = document.getElementById('ai-speech-bubble');
    const subtitleText = document.getElementById('ai-subtitle-text');
    subtitleText.innerText = text;
    
    // Trigger overlay fade-in animation
    bubble.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
    bubble.classList.add('opacity-100', 'translate-y-0');

    // Handle holographic glows on photo real
    const holoPulse = document.getElementById('hologram-pulse');
    const holoWaves = document.getElementById('hologram-waves');

    if (state.isMuted) {
        document.getElementById('ai-speaking-status').innerText = "กำลังนำเสนอข้อคิดเห็น (โหมดปิดเสียง)";
        startMouthAnimation();
        if (currentStyle === 'photo') {
            holoPulse.classList.remove('opacity-0');
            holoWaves.classList.remove('opacity-0');
        }
        setTimeout(() => {
            stopMouthAnimation();
            bubble.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            bubble.classList.remove('opacity-100', 'translate-y-0');
            holoPulse.classList.add('opacity-0');
            holoWaves.classList.add('opacity-0');
            document.getElementById('ai-speaking-status').innerText = "ผู้ช่วย AI พร้อมนำเสนอสรุปความเห็นเชิงรุก";
        }, 4000);
        return;
    }

    // Set voice based on gender
    const voiceName = currentGender === 'female' ? 'Aoede' : 'Charon';

    document.getElementById('ai-speaking-status').innerText = "AI กำลังอธิบายสไลด์สรุปยุทธศาสตร์...";
    startMouthAnimation();
    if (currentStyle === 'photo') {
        holoPulse.classList.remove('opacity-0');
        holoWaves.classList.remove('opacity-0');
    }

    try {
        await speakText(text, voiceName);
    } catch (e) {
        console.error("Gemini TTS Error:", e);
    } finally {
        stopMouthAnimation();
        setTimeout(() => {
            bubble.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            bubble.classList.remove('opacity-100', 'translate-y-0');
        }, 1500);
        holoPulse.classList.add('opacity-0');
        holoWaves.classList.add('opacity-0');
        document.getElementById('ai-speaking-status').innerText = "ผู้ช่วย AI พร้อมนำเสนอสรุปความเห็นเชิงรุก";
    }
}

function startMouthAnimation() {
    if (isMovingMouth) return;
    isMovingMouth = true;
    
    const mouthFemale = document.getElementById('mouth-female');
    const mouthMale = document.getElementById('mouth-male');
    
    mouthInterval = setInterval(() => {
        const shapeIndex = Math.floor(Math.random() * 4);
        let pathD_female = "M92 104 Q100 104 108 104"; // Default resting female mouth
        let pathD_male = "M92 102 Q100 102 108 102"; // Default resting male mouth
        
        switch (shapeIndex) {
            case 0:
                pathD_female = "M92 101 Q100 112 108 101 Q100 104 92 101";
                pathD_male = "M92 100 Q100 110 108 100 Q100 103 92 100";
                break;
            case 1:
                pathD_female = "M94 102 Q100 110 106 102 Q100 103 94 102";
                pathD_male = "M94 100 Q100 108 106 100 Q100 102 94 100";
                break;
            case 2:
                pathD_female = "M91 101 Q100 114 109 101 Q100 98 91 101";
                pathD_male = "M91 100 Q100 112 109 100 Q100 97 91 100";
                break;
            case 3:
                pathD_female = "M93 103 Q100 107 107 103 Q100 101 93 103";
                pathD_male = "M93 101 Q100 105 107 101 Q100 99 93 101";
                break;
        }
        
        if (currentGender === 'female') {
            mouthFemale.setAttribute('d', pathD_female);
        } else {
            mouthMale.setAttribute('d', pathD_male);
        }
    }, 100);
}

function stopMouthAnimation() {
    isMovingMouth = false;
    if (mouthInterval) {
        clearInterval(mouthInterval);
    }
    
    // Revert both SVGs back to gentle smile
    const mouthFemale = document.getElementById('mouth-female');
    const mouthMale = document.getElementById('mouth-male');
    
    if (mouthFemale) mouthFemale.setAttribute('d', "M92 103 Q100 109 108 103");
    if (mouthMale) mouthMale.setAttribute('d', "M92 101 Q100 107 108 101");
}

// ── Live Conversation Mode handlers ──

function renderTranscript() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    container.innerHTML = '';
    
    state.transcriptHistory.forEach(item => {
        if (item.role === 'system') return; // skip system warning messages if any
        
        const messageDiv = document.createElement('div');
        messageDiv.className = "flex gap-2 " + (item.role === 'user' ? "justify-end" : "justify-start");
        
        const contentDiv = document.createElement('div');
        if (item.role === 'user') {
            contentDiv.className = "bg-ttbBlue/30 text-white p-2.5 rounded-2xl rounded-tr-none border border-ttbBlue/25 max-w-[85%] font-light leading-relaxed";
            contentDiv.innerHTML = `<span class="text-[9px] text-sky-300 font-bold block mb-0.5">คุณ</span>` + item.text;
        } else {
            const assistantName = currentGender === 'female' ? 'คุณกนกวรรณ' : 'คุณวรุตม์';
            contentDiv.className = "bg-slate-900/80 text-slate-100 p-2.5 rounded-2xl rounded-tl-none border border-white/5 max-w-[85%] font-light leading-relaxed";
            contentDiv.innerHTML = `<span class="text-[9px] text-ttbOrange font-bold block mb-0.5">${assistantName}</span>` + item.text;
        }
        
        messageDiv.appendChild(contentDiv);
        container.appendChild(messageDiv);
    });
    
    // Auto scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function submitChatText() {
    const input = document.getElementById('chat-text-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    handleUserSpeech(text);
}

function handleChatInputKeyPress(event) {
    if (event.key === 'Enter') {
        submitChatText();
    }
}

async function startConversation() {
    // 1. Force audio context initialization
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass && !state.audioCtx) {
            state.audioCtx = new AudioContextClass();
        }
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            await state.audioCtx.resume();
        }
        state.isAudioUnlocked = true;
    } catch (e) {
        console.warn("Failed initializing AudioContext:", e);
    }

    // 2. Set connected states
    state.isConnected = true;
    state.isMuted = false;

    // 3. Update buttons visibility
    document.getElementById('btn-play-briefing').classList.add('hidden');
    document.getElementById('btn-start-conversation').classList.add('hidden');
    document.getElementById('btn-stop-conversation').classList.remove('hidden');

    // 4. Toggle Panels
    document.getElementById('mckinsey-triggers-panel').classList.add('hidden');
    document.getElementById('live-chat-panel').classList.remove('hidden');

    // 5. Initialize conversation history with welcome greeting
    state.transcriptHistory = [];
    const welcomeText = currentGender === 'female' 
        ? "สวัสดีค่ะท่านผู้บริหาร ดิฉันกนกวรรณผู้ช่วยของคุณ มีกลยุทธ์หัวข้อไหนที่อยากปรึกษาเป็นพิเศษวันนี้ไหมคะ"
        : "สวัสดีครับท่านผู้บริหาร ผมวรุตม์ยินดีให้บริการ ปรึกษาแผนยุทธศาสตร์หรือสอบถามข้อมูลทางธุรกิจกับผมได้เลยครับ";
        
    state.transcriptHistory.push({ role: 'model', text: welcomeText });
    renderTranscript();

    // 6. Speak the greeting
    speakText(welcomeText);
}

function stopConversation() {
    state.isConnected = false;
    
    // Stop microphone sessions
    if (state.recognition) {
        try {
            state.recognition.onresult = null;
            state.recognition.onerror = null;
            state.recognition.onend = null;
            state.recognition.abort();
        } catch (e) {}
        state.recognition = null;
    }
    state.isListening = false;

    // Abort active LLM responses and TTS
    interruptAI();

    // Update buttons visibility
    document.getElementById('btn-play-briefing').classList.remove('hidden');
    document.getElementById('btn-start-conversation').classList.remove('hidden');
    document.getElementById('btn-stop-conversation').classList.add('hidden');

    // Toggle Panels
    document.getElementById('mckinsey-triggers-panel').classList.remove('hidden');
    document.getElementById('live-chat-panel').classList.add('hidden');

    // Reset status indicator
    document.getElementById('ai-speaking-status').innerText = "ผู้ช่วย AI พร้อมนำเสนอสรุปความเห็นเชิงรุก";
    const dot = document.getElementById('ai-status-dot');
    if (dot) dot.className = "h-2 w-2 rounded-full bg-emerald-500 animate-pulse";
}

// Expose handlers globally for HTML inline events
window.setGender = setGender;
window.setRenderStyle = setRenderStyle;
window.toggleMute = toggleMute;
window.triggerIntelligence = triggerIntelligence;
window.simulateBriefingSpeech = simulateBriefingSpeech;
window.resetBriefingPanel = resetBriefingPanel;
window.openBriefingDrawer = openBriefingDrawer;
window.closeBriefingDrawer = closeBriefingDrawer;
window.startMouthAnimation = startMouthAnimation;
window.stopMouthAnimation = stopMouthAnimation;
window.startConversation = startConversation;
window.stopConversation = stopConversation;
window.submitChatText = submitChatText;
window.handleChatInputKeyPress = handleChatInputKeyPress;
window.renderTranscript = renderTranscript;

