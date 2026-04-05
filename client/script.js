'use strict';

/* ════════════════════════════════════════════════════
   RanAI – Guest Mode (No Login Required)
════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

const elements = {
  sidebar:           $('sidebar'),
  sidebarToggle:     $('sidebarToggle'),
  sidebarOverlay:    $('sidebarOverlay'),
  newChatBtn:        $('newChatBtn'),
  main:              $('main'),
  msgTextarea:       $('msgTextarea'),
  sendBtn:           $('sendBtn'),
  chatMessages:      $('chatMessages'),
  hero:              $('hero'),
  typingIndicator:   $('typingIndicator'),
  modelPill:         $('modelPill'),
  modelDropdown:     $('modelDropdown'),
  userRow:           $('userRow'),
  userDropdown:      $('userDropdown'),
  topbarAvatar:      $('topbarAvatar'),
  convList:          $('convList'),
  searchConv:        $('searchConv'),
  attachBtn:         $('attachBtn'),
  attachmentPreview: $('attachmentPreview'),
};

// Backend URL (change if needed)
const API = "https://ran-ai.onrender.com";

// Global state
let currentUser = { name: "Guest", email: "guest@example.com", picture: null, id: "guest" };
let currentConversationId = null;
let conversations  = [];
let attachedFiles  = [];
let currentModel   = "RanAI 4o";

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
    return { x: rand(0,W), y: rand(0,H), vx: rand(-0.18,0.18), vy: rand(-0.12,0.12), r: rand(1,2.2), alpha: rand(0.2,0.5) };
  }
  for (let i = 0; i < 90; i++) particles.push(makeParticle());
  document.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
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
    particles.forEach(p => {
      const mx = mouse.x - p.x, my = mouse.y - p.y;
      const md = Math.sqrt(mx*mx + my*my);
      if (md < 140) { p.vx += mx * 0.00015; p.vy += my * 0.00015; }
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
   TOAST & UTILS
════════════════════════════ */
function showToast(msg, duration = 2200) {
  const existing = document.querySelector('.ranai-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'ranai-toast';
  toast.innerText = msg;
  toast.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(10px);
    background:rgba(22,24,29,0.95);color:#eef0f4;
    padding:9px 20px;border-radius:30px;z-index:9999;
    font-size:13px;font-family:'Sora',sans-serif;font-weight:500;
    border:1px solid rgba(255,255,255,0.1);
    box-shadow:0 6px 24px rgba(0,0,0,0.4);
    backdrop-filter:blur(10px);
    transition:opacity 0.25s,transform 0.25s;opacity:0;`;
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

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function renderMarkdown(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
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
    const name = currentUser?.name || 'Guest';
    const letter = name.charAt(0).toUpperCase();
    avatarUrl = `https://ui-avatars.com/api/?name=${letter}&background=10a37f&color=fff`;
  }
  const avatar = document.createElement('img');
  avatar.className = 'message-avatar';
  avatar.src = avatarUrl;
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = renderMarkdown(text);
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

function showTyping() { elements.typingIndicator.style.display = 'flex'; scrollToBottom(); }
function hideTyping()  { elements.typingIndicator.style.display = 'none'; }

/* ════════════════════════════
   TIME & LANGUAGE
════════════════════════════ */
function getCurrentTimeInIndia() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5*3600000);
  let h = ist.getUTCHours(), m = ist.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return { hours: h % 12 || 12, minutes: String(m).padStart(2,'0'), ampm };
}

function detectLanguage(text) {
  const t = text.trim();
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  if (/\b(namaste|kaise ho|kya haal|kya chal|thik ho|bahut|mujhe|aap|main|kya baat|btao|shukriya|nahi|kyun|kab|kahan|kaun|mera|tera|hum|tum|bhai|dost|accha|theek)\b/i.test(t)) return 'hi';
  return 'en';
}

function getHumanResponse(userMsg, lang) {
  const lower = userMsg.toLowerCase().trim();
  if (/kitna baj|time kya|baj raha|baj rhe|what time/.test(lower)) {
    const { hours, minutes, ampm } = getCurrentTimeInIndia();
    return lang === 'hi'
      ? `अभी भारत में ${hours}:${minutes} ${ampm} बज रहे हैं। 😊 कुछ और पूछना है?`
      : `It's currently ${hours}:${minutes} ${ampm} in India. 😊 Anything else?`;
  }
  if (/kya kar rahe|kya kr rhe|what are you doing/.test(lower)) {
    const r = { hi: ["बस आपसे बात कर रहा हूँ! 😊", "आपकी मदद के लिए तैयार हूँ।"], en: ["Just chatting with you! 😊", "Ready to help!"] };
    const list = r[lang] || r.en;
    return list[Math.floor(Math.random() * list.length)];
  }
  if (/^(hi|hello|hey|namaste|hlo|hii)/.test(lower)) {
    const r = { hi: ["नमस्ते! 😊 मैं RanAi हूँ। कोई सवाल?", "हैलो! कैसे मदद करूँ?"], en: ["Hello! 👋 I'm RanAi. How can I help?", "Hey! 😊 Ask me anything!"] };
    return (r[lang]||r.en)[Math.floor(Math.random() * 2)];
  }
  if (/how are you|kaise ho|kya haal/.test(lower)) return lang==='hi' ? "बिल्कुल ठीक हूँ! आप कैसे हैं? 😊" : "Doing great, thanks! 😊";
  if (/thank|shukriya|धन्यवाद/.test(lower)) return lang==='hi' ? "आपका स्वागत है! 😊" : "You're welcome! 😊";
  if (/good morning|सुप्रभात/.test(lower)) return lang==='hi' ? "सुप्रभात! ☀️ आपका दिन शुभ हो।" : "Good morning! ☀️ Have a great day.";
  if (/good night|शुभ रात्रि/.test(lower)) return lang==='hi' ? "शुभ रात्रि! 🌙" : "Good night! 🌙";
  if (/(what is your name|your name|tumhara naam|aapka naam)/i.test(lower)) return lang==='hi' ? "मेरा नाम RanAi है।" : "My name is RanAi.";
  if (/(who (made|created|built) you|tumko kisne banaya)/i.test(lower)) return lang==='hi' ? "मुझे **R@njit** ने बनाया है!" : "I was created by **R@njit**!";
  if (/(i love you|love you|main tumse pyar)/i.test(lower)) return lang==='hi' ? "ओह! 😊 शुक्रिया! ❤️" : "Oh! 😊 Thank you! ❤️";
  return lang==='hi' ? "मैं यहाँ हूँ! 😊 कुछ भी पूछ सकते हैं।" : "I'm here! 😊 Go ahead and ask me anything.";
}

/* ════════════════════════════
   AI & IMAGE
════════════════════════════ */
async function sendMessageToAI(question) {
  const lang  = detectLanguage(question);
  const lower = question.toLowerCase().trim();
  const isCasual = /kitna baj|time kya|baj raha|kya kar rahe|^(hi|hello|hey|hlo|hii|namaste)|how are you|kaise ho|thank|shukriya|good morning|good night|what is your name|who made you|i love you/i.test(lower);
  showTyping();
  if (isCasual) {
    await sleep(600 + Math.random() * 400);
    hideTyping();
    addMessage('ai', getHumanResponse(question, lang));
    return;
  }
  const modifiedQuestion = lang === 'hi' ? question + ' (कृपया हिंदी में उत्तर दें)' : question;
  try {
    const res  = await fetch(`${API}/ask`, {
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
    const res  = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|hi`);
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
    const res  = await fetch(`${API}/analyze`, { method: 'POST', body: formData });
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
  const msg       = elements.msgTextarea.value.trim();
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
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
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
  const term     = elements.searchConv?.value.toLowerCase() || '';
  const filtered = conversations.filter(c => c.title.toLowerCase().includes(term));
  const today    = new Date().toDateString();
  const yest     = new Date(Date.now() - 86400000).toDateString();
  const groups   = { Today: [], Yesterday: [], Older: [] };
  filtered.forEach(conv => {
    const d = new Date(conv.createdAt).toDateString();
    if (d === today) groups.Today.push(conv);
    else if (d === yest) groups.Yesterday.push(conv);
    else groups.Older.push(conv);
  });
  let html = '';
  for (const [label, convs] of Object.entries(groups)) {
    if (!convs.length) continue;
    html += `<div class="conv-group"><div class="conv-group-label">${label}</div>`;
    convs.forEach(conv => {
      html += `<div class="conv-item ${conv.id===currentConversationId?'active':''}" data-id="${conv.id}">
        <span class="conv-title">${escapeHtml(conv.title)}</span>
        <button class="conv-delete" data-id="${conv.id}" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>`;
    });
    html += `</div>`;
  }
  elements.convList.innerHTML = html || '<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px;">No conversations yet</div>';
}

function initConversationEvents() {
  elements.convList.addEventListener('click', e => {
    const del  = e.target.closest('.conv-delete');
    if (del) { e.stopPropagation(); deleteConversation(del.dataset.id); return; }
    const item = e.target.closest('.conv-item');
    if (item && item.dataset.id !== currentConversationId) {
      currentConversationId = item.dataset.id;
      saveConversationsToSession();
      renderConversationList();
      loadConversationMessages();
      if (window.innerWidth <= 768) closeSidebarMobile();
    }
  });
}

/* ════════════════════════════
   SIDEBAR, MODEL, USER MENU
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
    else sidebar.classList.remove('mobile-open', 'collapsed');
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

function initModelDropdown() {
  elements.modelPill.addEventListener('click', e => {
    e.stopPropagation();
    const dd   = elements.modelDropdown;
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
    if (!elements.modelDropdown.contains(e.target) && !elements.modelPill.contains(e.target))
      elements.modelDropdown.classList.remove('open');
  });
}

function initUserMenu() {
  const userMenuBtn = $('userMenuBtn');
  const ud = elements.userDropdown;
  function openUserDropdown(near) {
    if (!near) return;
    const rect = near.getBoundingClientRect();
    ud.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    ud.style.left   = rect.left + 'px';
    ud.style.top    = 'auto';
    ud.classList.toggle('open');
  }
  if (userMenuBtn) userMenuBtn.addEventListener('click', e => { e.stopPropagation(); openUserDropdown(elements.userRow); });
  elements.topbarAvatar?.addEventListener('click', e => { e.stopPropagation(); openUserDropdown(elements.topbarAvatar); });
  document.addEventListener('click', e => { if (!ud.contains(e.target)) ud.classList.remove('open'); });
  $('profileMenuItem')?.addEventListener('click',  () => { ud.classList.remove('open'); openProfile(); });
  $('settingsMenuItem')?.addEventListener('click', () => { ud.classList.remove('open'); showToast('Settings coming soon!'); });
  $('upgradeMenuItem')?.addEventListener('click',  () => { ud.classList.remove('open'); showToast('Upgrade plans coming soon! ⭐'); });
  $('upgradeBtn')?.addEventListener('click', () => showToast('Upgrade plans coming soon! ⭐'));
}

/* ════════════════════════════
   PROFILE (guest version)
════════════════════════════ */
function openProfile() {
  if (!currentUser) return;
  $('profileName').innerText   = currentUser.name || 'Guest';
  $('profileEmail').innerText  = currentUser.email || 'guest@example.com';
  $('profileAvatar').src       = currentUser.picture || `https://ui-avatars.com/api/?name=Guest&background=10a37f&color=fff&size=128`;
  const statEl = $('statChats');
  if (statEl) statEl.innerText = conversations.filter(c=>c.messages.length).length;
  elements.profileModal.style.display = 'flex';
}
function closeProfile() { elements.profileModal.style.display = 'none'; }

/* ════════════════════════════
   SUGGESTIONS
════════════════════════════ */
function loadSuggestions() {
  const suggestions = [
    { icon: '🧠', main: "Explain quantum computing", sub: "in simple terms" },
    { icon: '💻', main: "Write a Python script",     sub: "to scrape a website" },
    { icon: '💪', main: "Create a workout plan",     sub: "for beginners" },
    { icon: '📄', main: "Summarize this article",    sub: "paste a URL or text" },
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
   ATTACHMENTS & TOOL BUTTONS
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
   UPDATE USER UI
════════════════════════════ */
function updateUserUI() {
  if (!currentUser) return;
  const displayName = currentUser.name || 'Guest';
  document.querySelectorAll('.user-name').forEach(el => el.innerText = displayName);
  document.querySelectorAll('.user-dd-name').forEach(el => el.innerText = displayName);
  document.querySelectorAll('.user-dd-email').forEach(el => el.innerText = currentUser.email || 'guest@example.com');
  const avatarUrl = currentUser.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=10a37f&color=fff`;
  document.querySelectorAll('.user-avatar, .topbar-avatar img, .user-dd-avatar').forEach(img => {
    if (img.tagName === 'IMG') img.src = avatarUrl;
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

  elements.newChatBtn?.addEventListener('click', () => newConversation());
}

/* ════════════════════════════
   INIT (Guest Mode – No Login)
════════════════════════════ */
window.onload = () => {
  // Directly show main app as guest
  elements.main.style.display = 'flex';
  updateUserUI();
  loadConversationsFromSession();
  loadSuggestions();
  
  // Initialize UI components
  initSidebar();
  initModelDropdown();
  initUserMenu();
  initAttachments();
  initToolBtns();
  initEventListeners();
  initConversationEvents();
};
