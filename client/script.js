'use strict';

/* ════════════════════════════════════════════════════
   RanAI – Enhanced Script
   Particle background + premium micro-interactions
════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

const elements = {
  sidebar: $('sidebar'),
  sidebarToggle: $('sidebarToggle'),
  sidebarOverlay: $('sidebarOverlay'),
  newChatBtn: $('newChatBtn'),
  main: $('main'),
  signupModal: $('signupModal'),
  msgTextarea: $('msgTextarea'),
  sendBtn: $('sendBtn'),
  chatMessages: $('chatMessages'),
  hero: $('hero'),
  typingIndicator: $('typingIndicator'),
  modelPill: $('modelPill'),
  modelDropdown: $('modelDropdown'),
  userRow: $('userRow'),
  userDropdown: $('userDropdown'),
  topbarAvatar: $('topbarAvatar'),
  profileModal: $('profileModal'),
  convList: $('convList'),
  searchConv: $('searchConv'),
  attachBtn: $('attachBtn'),
  attachmentPreview: $('attachmentPreview'),
};

const API = "http://localhost:5000";

let currentConversationId = null;
let conversations = [];
let attachedFiles = [];
let currentModel = "RanAI 4o";
let isLoggedIn = false;
let currentUser = { firstName: '', lastName: '', email: '' };
let tempEmail = '';

/* ════════════════════════════
   PARTICLE BACKGROUND
════════════════════════════ */
(function initParticles() {
  const canvas = $('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [], mouse = { x: -999, y: -999 };

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function makeParticle() {
    return {
      x: rand(0, W), y: rand(0, H),
      vx: rand(-0.18, 0.18), vy: rand(-0.12, 0.12),
      r: rand(1, 2.2),
      alpha: rand(0.2, 0.5),
    };
  }

  for (let i = 0; i < 90; i++) particles.push(makeParticle());

  document.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Connection lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 110) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(16,163,127,${0.06 * (1 - dist/110)})`;
          ctx.lineWidth = 0.6;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Dots
    particles.forEach(p => {
      // subtle mouse pull
      const mx = mouse.x - p.x, my = mouse.y - p.y;
      const md = Math.sqrt(mx*mx + my*my);
      if (md < 140) {
        p.vx += mx * 0.00015;
        p.vy += my * 0.00015;
      }
      // speed cap
      const spd = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
      if (spd > 0.5) { p.vx *= 0.5/spd; p.vy *= 0.5/spd; }

      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(16,163,127,${p.alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
})();

/* ════════════════════════════
   TOAST
════════════════════════════ */
function showToast(msg, duration = 2200) {
  const existing = document.querySelector('.ranai-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'ranai-toast';
  toast.innerText = msg;
  toast.style.cssText = `
    position:fixed; bottom:90px; left:50%; transform:translateX(-50%) translateY(10px);
    background:rgba(22,24,29,0.95); color:#eef0f4;
    padding:9px 20px; border-radius:30px; z-index:9999;
    font-size:13px; font-family:'Sora',sans-serif; font-weight:500;
    border:1px solid rgba(255,255,255,0.1);
    box-shadow:0 6px 24px rgba(0,0,0,0.4);
    backdrop-filter:blur(10px);
    transition:opacity 0.25s, transform 0.25s;
    opacity:0;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(6px)';
    setTimeout(() => toast.remove(), 280);
  }, duration);
}

/* ════════════════════════════
   UTILS
════════════════════════════ */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function scrollToBottom() {
  const area = document.querySelector('.chat-scroll-area');
  if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
}

/* ════════════════════════════
   MESSAGES
════════════════════════════ */
function addMessage(role, text, saveToConversation = true) {
  const container = elements.chatMessages;
  if (!container) return;

  if (elements.hero.style.display !== 'none') {
    elements.hero.style.display = 'none';
    container.classList.add('show');
    container.style.display = 'flex';
  }

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  let avatarUrl = '';
  if (role === 'ai') {
    avatarUrl = document.querySelector('.brand-img')?.src || 'LOGO.png';
  } else {
    const letter = (currentUser.firstName || 'U').charAt(0).toUpperCase();
    avatarUrl = `https://ui-avatars.com/api/?name=${letter}&background=10a37f&color=fff`;
  }
  const avatar = document.createElement('img');
  avatar.className = 'message-avatar';
  avatar.src = avatarUrl;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;

  if (role === 'ai') {
    row.appendChild(avatar);
    row.appendChild(bubble);
  } else {
    row.appendChild(bubble);
    row.appendChild(avatar);
  }

  container.appendChild(row);
  scrollToBottom();

  if (saveToConversation && currentConversationId) {
    const conv = conversations.find(c => c.id === currentConversationId);
    if (conv) {
      conv.messages.push({ role, text });
      if (role === 'user' && conv.messages.filter(m=>m.role==='user').length === 1 && conv.title === 'New conversation') {
        conv.title = text.length > 32 ? text.substring(0, 32) + '…' : text;
      }
      saveConversationsToSession();
      renderConversationList();
    }
  }
}

function showTyping() {
  elements.typingIndicator.style.display = 'flex';
  scrollToBottom();
}
function hideTyping() {
  elements.typingIndicator.style.display = 'none';
}

/* ════════════════════════════
   TIME (IST)
════════════════════════════ */
function getCurrentTimeInIndia() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5*3600000);
  let h = ist.getUTCHours(), m = ist.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h % 12 || 12;
  return { hours: dh, minutes: String(m).padStart(2,'0'), ampm };
}

/* ════════════════════════════
   LANGUAGE DETECTION
════════════════════════════ */
function detectLanguage(text) {
  const t = text.trim();
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  if (/(?:namaste|kaise ho|kya haal|kya chal|thik ho|bahut|mujhe|aap|main|kya baat|baj r|kr r|kar rahe|btao|india|ke bare|ke baare|pm|shukriya)/i.test(t)) return 'hi';
  return 'en';
}

/* ════════════════════════════
   HUMAN-LIKE RESPONSES
════════════════════════════ */
function getHumanResponse(userMsg, lang) {
  const lower = userMsg.toLowerCase().trim();

  if (/kitna baj|time kya|baj raha|baj rhe|what time/.test(lower)) {
    const { hours, minutes, ampm } = getCurrentTimeInIndia();
    return lang === 'hi'
      ? `अभी भारत में ${hours}:${minutes} ${ampm} बज रहे हैं। 😊 कुछ और पूछना है?`
      : `It's currently ${hours}:${minutes} ${ampm} in India. 😊 Anything else?`;
  }

  if (/kya kar rahe|kya kr rhe|what are you doing/.test(lower)) {
    const r = {
      hi: ["बस आपसे बात कर रहा हूँ! 😊 आप बताइए?", "आपकी मदद के लिए तैयार हूँ। क्या चाहिए?"],
      en: ["Just chatting with you! 😊 What's on your mind?", "Ready to help! What do you need?"]
    };
    const list = r[lang] || r.en;
    return list[Math.floor(Math.random() * list.length)];
  }

  if (/^(hi|hello|hey|namaste|hlo|hii)/.test(lower)) {
    const r = {
      hi: ["नमस्ते! 😊 आज कैसा दिन है? कुछ पूछना हो तो बताएं।", "हैलो! मैं RanAI हूँ। क्या सेवा कर सकता हूँ?"],
      en: ["Hello! 👋 Great to see you. What can I help with today?", "Hey! 😊 I'm RanAI. Ask me anything!"]
    };
    const list = r[lang] || r.en;
    return list[Math.floor(Math.random() * list.length)];
  }

  if (/how are you|kaise ho|kya haal/.test(lower)) {
    return lang === 'hi'
      ? "बिल्कुल ठीक हूँ, शुक्रिया! आप कैसे हैं? 😊 आज क्या पूछना है?"
      : "Doing great, thanks! 😊 How about you? What would you like to explore today?";
  }

  if (/thank|shukriya|धन्यवाद/.test(lower)) {
    return lang === 'hi' ? "आपका स्वागत है! 😊 हमेशा मदद के लिए तैयार हूँ।" : "You're very welcome! 😊 Happy to help anytime.";
  }

  if (/good morning|सुप्रभात/.test(lower)) {
    return lang === 'hi' ? "सुप्रभात! ☀️ आपका दिन शानदार हो। आज क्या करने का विचार है?" : "Good morning! ☀️ Hope your day is amazing. What's on the agenda?";
  }

  if (/good night|शुभ रात्रि/.test(lower)) {
    return lang === 'hi' ? "शुभ रात्रि! 🌙 अच्छी नींद लें। कल फिर मिलेंगे।" : "Good night! 🌙 Sleep well. See you tomorrow!";
  }

  // Default
  return lang === 'hi'
    ? "मैं यहाँ हूँ! 😊 आप बताइए क्या जानना चाहते हैं?"
    : "I'm here! 😊 Go ahead and ask me anything.";
}

/* ════════════════════════════
   AI CALL
════════════════════════════ */
async function sendMessageToAI(question) {
  const lang = detectLanguage(question);
  const lower = question.toLowerCase().trim();

  const isCasual = /kitna baj|time kya|baj raha|kya kar rahe|kya kr rhe|what are you doing|^(hi|hello|hey|hlo|hii|namaste)|how are you|kaise ho|kya haal|thank|shukriya|good morning|good night/.test(lower);

  showTyping();

  if (isCasual) {
    await sleep(600 + Math.random() * 500);
    hideTyping();
    addMessage('ai', getHumanResponse(question, lang));
    return;
  }

  let modifiedQuestion = question;
  if (lang === 'hi') modifiedQuestion = question + " (कृपया हिंदी में उत्तर दें)";

  try {
    const res = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: modifiedQuestion, model: currentModel, lang })
    });
    const data = await res.json();
    hideTyping();
    let answer = data.reply || 'Sorry, I encountered an error.';
    if (lang === 'hi' && !/[\u0900-\u097F]/.test(answer)) {
      answer = await translateText(answer, 'hi');
    }
    addMessage('ai', answer);
  } catch {
    hideTyping();
    addMessage('ai', '🌐 Network error. Make sure the backend is running.');
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function translateText(text, targetLang) {
  if (targetLang !== 'hi') return text;
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|hi`);
    const data = await res.json();
    if (data?.responseData?.translatedText) return data.responseData.translatedText;
  } catch {}
  return text;
}

async function sendImageToAI(imageFile, textQuery) {
  showTyping();
  const formData = new FormData();
  formData.append('image', imageFile);
  if (textQuery?.trim()) formData.append('query', textQuery);
  try {
    const res = await fetch(`${API}/analyze`, { method:'POST', body: formData });
    const data = await res.json();
    hideTyping();
    if (data.success) {
      let answer = data.answer;
      if (detectLanguage(textQuery||'') === 'hi' && !/[\u0900-\u097F]/.test(answer))
        answer = await translateText(answer, 'hi');
      addMessage('ai', `🔍 Detected: ${data.detected}\n\n📝 ${answer}`);
    } else {
      addMessage('ai', `⚠️ ${data.error || 'Could not analyze the image.'}`);
    }
  } catch {
    hideTyping();
    addMessage('ai', '🌐 Could not reach the image analysis server.');
  }
}

/* ════════════════════════════
   SEND HANDLER
════════════════════════════ */
async function handleSend() {
  const msg = elements.msgTextarea.value.trim();
  const hasImages = attachedFiles.some(f => f.type.startsWith('image/'));
  const hasOther  = attachedFiles.some(f => !f.type.startsWith('image/'));

  if (hasOther) showToast('Only image files can be analyzed. Others ignored.', 3000);
  if (msg) addMessage('user', msg);

  if (hasImages) {
    const imageFile = attachedFiles.find(f => f.type.startsWith('image/'));
    attachedFiles = []; renderAttachments();
    elements.msgTextarea.value = ''; autoResizeTextarea();
    await sendImageToAI(imageFile, msg || '');
    return;
  }

  if (attachedFiles.length) { attachedFiles = []; renderAttachments(); }
  elements.msgTextarea.value = ''; autoResizeTextarea();
  if (msg) await sendMessageToAI(msg);
}

function autoResizeTextarea() {
  const ta = elements.msgTextarea;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  elements.sendBtn.disabled = ta.value.trim() === '';
}

function renderAttachments() {
  elements.attachmentPreview.innerHTML = '';
  attachedFiles.forEach((file, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.innerHTML = `<span>${escapeHtml(file.name)} (${(file.size/1024).toFixed(1)} KB)</span><button class="remove-attach" data-idx="${idx}">✖</button>`;
    elements.attachmentPreview.appendChild(chip);
  });
  document.querySelectorAll('.remove-attach').forEach(btn => {
    btn.addEventListener('click', () => {
      attachedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderAttachments();
    });
  });
}

/* ════════════════════════════
   CONVERSATIONS
════════════════════════════ */
function saveConversationsToSession() {
  sessionStorage.setItem('ranai_conversations', JSON.stringify(conversations));
  sessionStorage.setItem('ranai_currentConvId', currentConversationId);
}

function loadConversationsFromSession() {
  const saved = sessionStorage.getItem('ranai_conversations');
  if (saved) conversations = JSON.parse(saved);
  const savedId = sessionStorage.getItem('ranai_currentConvId');
  if (savedId && conversations.find(c => c.id === savedId)) currentConversationId = savedId;
  else if (conversations.length) currentConversationId = conversations[0].id;
  else newConversation();
  renderConversationList();
  loadConversationMessages();
}

function newConversation() {
  const id = Date.now().toString();
  conversations.unshift({ id, title: 'New conversation', messages: [], createdAt: new Date().toISOString() });
  currentConversationId = id;
  saveConversationsToSession();
  renderConversationList();
  clearChatArea();
}

function clearChatArea() {
  elements.chatMessages.innerHTML = '';
  elements.chatMessages.classList.remove('show');
  elements.chatMessages.style.display = 'none';
  elements.hero.style.display = 'flex';
  hideTyping();
}

function loadConversationMessages() {
  const conv = conversations.find(c => c.id === currentConversationId);
  if (!conv) return;
  elements.chatMessages.innerHTML = '';
  elements.chatMessages.classList.remove('show');
  elements.chatMessages.style.display = 'none';
  elements.hero.style.display = 'flex';
  conv.messages.forEach(msg => addMessage(msg.role, msg.text, false));
  if (conv.messages.length) {
    elements.hero.style.display = 'none';
    elements.chatMessages.classList.add('show');
    elements.chatMessages.style.display = 'flex';
    scrollToBottom();
  }
}

function deleteConversation(id) {
  conversations = conversations.filter(c => c.id !== id);
  if (currentConversationId === id) {
    if (conversations.length) currentConversationId = conversations[0].id;
    else { newConversation(); return; }
  }
  saveConversationsToSession();
  renderConversationList();
  loadConversationMessages();
  showToast('Conversation deleted');
}

function renderConversationList() {
  const term = elements.searchConv.value.toLowerCase();
  const filtered = conversations.filter(c => c.title.toLowerCase().includes(term));
  const today = new Date().toDateString();
  const yest  = new Date(Date.now() - 86400000).toDateString();
  const groups = { Today:[], Yesterday:[], Older:[] };
  filtered.forEach(conv => {
    const d = new Date(conv.createdAt).toDateString();
    if (d === today)   groups.Today.push(conv);
    else if (d===yest) groups.Yesterday.push(conv);
    else               groups.Older.push(conv);
  });
  let html = '';
  for (const [label, convs] of Object.entries(groups)) {
    if (!convs.length) continue;
    html += `<div class="conv-group"><div class="conv-group-label">${label}</div>`;
    convs.forEach(conv => {
      html += `<div class="conv-item ${conv.id===currentConversationId?'active':''}" data-id="${conv.id}">
        <span class="conv-title">${escapeHtml(conv.title)}</span>
        <button class="conv-delete" data-id="${conv.id}" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>`;
    });
    html += `</div>`;
  }
  elements.convList.innerHTML = html || '<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px;">No conversations yet</div>';
}

function initConversationEvents() {
  elements.convList.addEventListener('click', e => {
    const del = e.target.closest('.conv-delete');
    if (del) { e.stopPropagation(); deleteConversation(del.dataset.id); return; }
    const item = e.target.closest('.conv-item');
    if (item && item.dataset.id !== currentConversationId) {
      currentConversationId = item.dataset.id;
      saveConversationsToSession();
      renderConversationList();
      loadConversationMessages();
      // auto-close on mobile
      if (window.innerWidth <= 768) closeSidebarMobile();
    }
  });
}

/* ════════════════════════════
   SIDEBAR
════════════════════════════ */
function closeSidebarMobile() {
  elements.sidebar.classList.remove('mobile-open');
  elements.sidebarOverlay?.classList.remove('active');
}

function initSidebar() {
  const { sidebar, sidebarToggle: btn, sidebarOverlay: overlay } = elements;
  if (!sidebar || !btn) return;

  const isMobile = () => window.innerWidth <= 768;

  function initState() {
    if (!isMobile()) sidebar.classList.add('collapsed');
    else { sidebar.classList.remove('mobile-open','collapsed'); }
  }

  function toggle() {
    if (isMobile()) {
      sidebar.classList.toggle('mobile-open');
      overlay?.classList.toggle('active');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  }

  btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) {
      if (!sidebar.classList.contains('collapsed')) sidebar.classList.add('collapsed');
      sidebar.classList.remove('mobile-open');
      overlay?.classList.remove('active');
    } else {
      initState();
    }
  });

  initState();
}

/* ════════════════════════════
   MODEL DROPDOWN
════════════════════════════ */
function initModelDropdown() {
  elements.modelPill.addEventListener('click', e => {
    e.stopPropagation();
    const dd = elements.modelDropdown;
    // position under pill
    const rect = elements.modelPill.getBoundingClientRect();
    dd.style.top  = (rect.bottom + 8) + 'px';
    dd.style.left = rect.left + 'px';
    dd.classList.toggle('open');
  });

  document.querySelectorAll('.model-option').forEach(opt => {
    opt.addEventListener('click', () => {
      currentModel = opt.dataset.model;
      const pillSpan = elements.modelPill.querySelector('span:not(.model-dot)');
      if (pillSpan) pillSpan.innerText = currentModel;
      const dot = elements.modelPill.querySelector('.model-dot');
      if (dot) dot.style.background = opt.querySelector('.model-color-dot')?.style.background || '#10a37f';
      document.querySelectorAll('.model-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      elements.modelDropdown.classList.remove('open');
      showToast(`Switched to ${currentModel}`);
    });
  });

  document.addEventListener('click', e => {
    if (!elements.modelDropdown.contains(e.target) && e.target !== elements.modelPill && !elements.modelPill.contains(e.target))
      elements.modelDropdown.classList.remove('open');
  });
}

/* ════════════════════════════
   USER MENU
════════════════════════════ */
function initUserMenu() {
  const userMenuBtn = $('userMenuBtn');
  const ud = elements.userDropdown;

  function openUserDropdown(near) {
    if (!near) return;
    const rect = near.getBoundingClientRect();
    ud.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    ud.style.left = rect.left + 'px';
    ud.style.top = 'auto';
    ud.classList.toggle('open');
  }

  if (userMenuBtn) userMenuBtn.addEventListener('click', e => { e.stopPropagation(); openUserDropdown(elements.userRow); });
  elements.topbarAvatar?.addEventListener('click', e => { e.stopPropagation(); openUserDropdown(elements.topbarAvatar); });

  document.addEventListener('click', e => {
    if (!ud.contains(e.target)) ud.classList.remove('open');
  });

  $('profileMenuItem')?.addEventListener('click', () => { ud.classList.remove('open'); openProfile(); });
  $('settingsMenuItem')?.addEventListener('click', () => { ud.classList.remove('open'); showToast('Settings coming soon!'); });
  $('upgradeMenuItem')?.addEventListener('click', () => { ud.classList.remove('open'); showToast('Upgrade plans coming soon! ⭐'); });
  $('logoutMenuItem')?.addEventListener('click', () => {
    sessionStorage.clear(); localStorage.removeItem('ranai_user');
    window.location.reload();
  });
  $('upgradeBtn')?.addEventListener('click', () => showToast('Upgrade plans coming soon! ⭐'));
}

/* ════════════════════════════
   PROFILE
════════════════════════════ */
function openProfile() {
  if (!currentUser.firstName) return;
  $('profileName').innerText = `${currentUser.firstName} ${currentUser.lastName}`;
  $('profileEmail').innerText = currentUser.email;
  $('profileAvatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.firstName)}&background=10a37f&color=fff&size=128`;
  const statEl = $('statChats');
  if (statEl) statEl.innerText = conversations.filter(c=>c.messages.length).length;
  elements.profileModal.style.display = 'flex';
}

function closeProfile() {
  elements.profileModal.style.display = 'none';
}

/* ════════════════════════════
   SUGGESTIONS
════════════════════════════ */
function loadSuggestions() {
  const suggestions = [
    { icon: '🧠', main: "Explain quantum computing", sub: "in simple terms" },
    { icon: '💻', main: "Write a Python script", sub: "to scrape a website" },
    { icon: '💪', main: "Create a workout plan", sub: "for beginners" },
    { icon: '📄', main: "Summarize this article", sub: "paste a URL or text" },
  ];
  const grid = $('suggestionGrid');
  if (!grid) return;
  grid.innerHTML = suggestions.map(s => `
    <div class="sug-card" data-text="${escapeHtml(s.main)}">
      <div class="sug-icon">${s.icon}</div>
      <div><div class="sug-main">${escapeHtml(s.main)}</div><div class="sug-sub">${escapeHtml(s.sub)}</div></div>
    </div>
  `).join('');
  grid.querySelectorAll('.sug-card').forEach(card => {
    card.addEventListener('click', () => {
      elements.msgTextarea.value = card.dataset.text;
      autoResizeTextarea();
      handleSend();
    });
  });
}

/* ════════════════════════════
   ATTACHMENTS
════════════════════════════ */
function initAttachments() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.multiple = true; fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  elements.attachBtn?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    attachedFiles.push(...Array.from(e.target.files));
    renderAttachments();
    fileInput.value = '';
  });
}

/* ════════════════════════════
   TOOL BTNS (Search / Reason)
════════════════════════════ */
function initToolBtns() {
  $('webSearchBtn')?.addEventListener('click', function() {
    this.classList.toggle('active');
    showToast(this.classList.contains('active') ? 'Web search enabled' : 'Web search disabled');
  });
  $('reasonBtn')?.addEventListener('click', function() {
    this.classList.toggle('active');
    showToast(this.classList.contains('active') ? 'Reasoning mode on' : 'Reasoning mode off');
  });
  $('micBtn')?.addEventListener('click', () => showToast('Voice input coming soon! 🎙️'));
  $('shareChatBtn')?.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).then(() => showToast('Link copied! 🔗'));
    } else showToast('Share coming soon!');
  });
}

/* ════════════════════════════
   SIGNUP FLOW
════════════════════════════ */
async function sendOtp() {
  const email = $('email').value.trim();
  if (!email) return showToast('Please enter your email');
  const btn = $('sendOtpBtn');
  btn.style.opacity = '0.7';
  const msgDiv = $('otpMessage');
  msgDiv.style.color = 'var(--text-3)'; msgDiv.innerText = 'Sending…';
  try {
    const res = await fetch(`${API}/send-otp`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email}) });
    const data = await res.json();
    msgDiv.style.color = '#22c55e'; msgDiv.innerText = data.message || 'OTP sent!';
  } catch {
    msgDiv.style.color = '#ff6b6b'; msgDiv.innerText = 'Failed to send OTP. Check backend.';
  }
  btn.style.opacity = '1';
}

async function verifyOtp() {
  const email = $('email').value.trim();
  const otp = $('otp').value.trim();
  if (!email || !otp) return showToast('Enter email and OTP');
  const msgDiv = $('otpMessage');
  msgDiv.style.color = 'var(--text-3)'; msgDiv.innerText = 'Verifying…';
  try {
    const res = await fetch(`${API}/verify-otp`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,otp}) });
    const data = await res.json();
    if (data.success) {
      msgDiv.style.color = '#22c55e'; msgDiv.innerText = 'Verified! Set your password and name.';
      tempEmail = email;
      // animate step transition
      const s1 = $('signupStep1'), s2 = $('signupStep2');
      s1.style.transition = 'opacity 0.25s, transform 0.25s';
      s1.style.opacity = '0'; s1.style.transform = 'translateX(-20px)';
      setTimeout(() => {
        s1.style.display = 'none';
        s2.style.display = 'flex';
        s2.style.opacity = '0'; s2.style.transform = 'translateX(20px)';
        requestAnimationFrame(() => {
          s2.style.transition = 'opacity 0.25s, transform 0.25s';
          s2.style.opacity = '1'; s2.style.transform = 'none';
        });
      }, 260);
    } else {
      msgDiv.style.color = '#ff6b6b'; msgDiv.innerText = data.message || 'Verification failed';
    }
  } catch {
    msgDiv.style.color = '#ff6b6b'; msgDiv.innerText = 'Error during verification.';
  }
}

async function signup() {
  const password  = $('password').value;
  const firstName = $('firstName').value.trim();
  const lastName  = $('lastName').value.trim();
  if (!password || !firstName || !lastName) return showToast('Please fill all fields');
  const btn = $('signupBtn'); btn.style.opacity = '0.7';
  try {
    const res = await fetch(`${API}/signup`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:tempEmail, password, firstName, lastName}) });
    const data = await res.json();
    if (data.success) {
      currentUser = {firstName, lastName, email:tempEmail};
      sessionStorage.setItem('ranai_user', JSON.stringify(currentUser));
      isLoggedIn = true;
      // animate modal out
      const box = document.querySelector('.signup-box');
      box.style.transition = 'opacity 0.3s, transform 0.3s';
      box.style.opacity = '0'; box.style.transform = 'scale(0.9)';
      setTimeout(() => {
        elements.signupModal.style.display = 'none';
        elements.main.style.display = 'grid';
        updateUserUI();
        conversations = [];
        newConversation();
        loadSuggestions();
        showToast(`Welcome, ${firstName}! 🎉`);
      }, 320);
    } else {
      showToast(data.message || 'Signup failed');
    }
  } catch {
    showToast('Signup error. Check backend connection.');
  }
  btn.style.opacity = '1';
}

function updateUserUI() {
  const name = `${currentUser.firstName} ${currentUser.lastName}`;
  document.querySelectorAll('.user-name').forEach(el => el.innerText = name);
  document.querySelectorAll('.user-dd-name').forEach(el => el.innerText = name);
  document.querySelectorAll('.user-dd-email').forEach(el => el.innerText = currentUser.email);
  const url = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.firstName)}&background=10a37f&color=fff`;
  document.querySelectorAll('.user-avatar').forEach(img => img.src = url);
  document.querySelectorAll('.topbar-avatar img, .user-dd-avatar').forEach(img => { if(img.tagName==='IMG') img.src = url; });
}

/* ════════════════════════════
   PASSWORD TOGGLE
════════════════════════════ */
function initPasswordToggle() {
  $('togglePass')?.addEventListener('click', () => {
    const inp = $('password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
}

/* ════════════════════════════
   EVENT LISTENERS
════════════════════════════ */
function initEventListeners() {
  elements.sendBtn?.addEventListener('click', handleSend);
  elements.msgTextarea?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!elements.sendBtn.disabled) handleSend(); }
  });
  elements.msgTextarea?.addEventListener('input', autoResizeTextarea);
  elements.searchConv?.addEventListener('input', renderConversationList);

  $('closeProfileBtn')?.addEventListener('click', closeProfile);
  elements.profileModal?.addEventListener('click', e => { if (e.target === elements.profileModal) closeProfile(); });

  $('sendOtpBtn')?.addEventListener('click', sendOtp);
  $('verifyOtpBtn')?.addEventListener('click', verifyOtp);
  $('signupBtn')?.addEventListener('click', signup);

  elements.newChatBtn?.addEventListener('click', () => newConversation());

  // Enter on OTP input
  $('otp')?.addEventListener('keydown', e => { if (e.key==='Enter') verifyOtp(); });
  $('email')?.addEventListener('keydown', e => { if (e.key==='Enter') sendOtp(); });
}

/* ════════════════════════════
   INIT
════════════════════════════ */
window.onload = () => {
  sessionStorage.clear();
  localStorage.removeItem('ranai_user');

  $('signupStep1').style.display = 'flex';
  $('signupStep2').style.display = 'none';
  elements.signupModal.style.display = 'flex';
  elements.main.style.display = 'none';

  initSidebar();
  initModelDropdown();
  initUserMenu();
  initAttachments();
  initToolBtns();
  initEventListeners();
  initConversationEvents();
  initPasswordToggle();
};