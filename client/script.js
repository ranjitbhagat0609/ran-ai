'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   RanAI – with Login/Signup + Voice + OCR + FIXED NETWORK HANDLING
   No database – localStorage only
═══════════════════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

const API = "https://ran-ai.onrender.com";

// ──── Global state ─────────────────────────────────────────────────────
let currentUser          = null;
let currentConversationId = null;
let conversations        = [];
let attachedFiles        = [];
let currentModel         = "RanAI 4o";
let mediaRecognition     = null;
let isRecording          = false;
let shouldSpeakNextReply = false;

// Load Tesseract for OCR
let Tesseract = null;
function loadTesseract() {
  if (window.Tesseract) {
    Tesseract = window.Tesseract;
    return Promise.resolve(Tesseract);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => {
      Tesseract = window.Tesseract;
      resolve(Tesseract);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
loadTesseract().catch(e => console.warn('Tesseract failed to load', e));

/* ═══════════════════════════════════════════════════════════════════════
   PARTICLE BACKGROUND (unchanged)
═══════════════════════════════════════════════════════════════════════ */
(function initParticles() {
  const canvas = $('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [], mouse = { x: -999, y: -999 };

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
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
          ctx.strokeStyle = `rgba(0,229,160,${0.07 * (1 - dist/110)})`;
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
      ctx.fillStyle = `rgba(0,229,160,${p.alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ═══════════════════════════════════════════════════════════════════════
   TOAST & UTILS
═══════════════════════════════════════════════════════════════════════ */
function showToast(msg, duration) {
  duration = duration || 2200;
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

/* ═══════════════════════════════════════════════════════════════════════
   TYPING ANIMATION – ChatGPT-style word-by-word reveal
═══════════════════════════════════════════════════════════════════════ */
function typeAIMessage(bubble, text, onDone) {
  // Split into tokens: preserve spaces so we can animate word by word
  const tokens = text.split(/(\s+)/);
  let i = 0;
  let rendered = '';

  // Cursor blink element
  const cursor = document.createElement('span');
  cursor.className = 'ranai-typing-cursor';
  cursor.innerHTML = '▋';
  cursor.style.cssText = 'display:inline-block;margin-left:1px;animation:ranai-cursor-blink 0.7s step-start infinite;opacity:1;color:var(--accent,#10a37f);font-size:0.9em;';

  bubble.innerHTML = '';
  bubble.appendChild(cursor);

  // Inject cursor blink keyframes once
  if (!document.getElementById('ranai-cursor-style')) {
    const style = document.createElement('style');
    style.id = 'ranai-cursor-style';
    style.textContent = `@keyframes ranai-cursor-blink{0%,100%{opacity:1}50%{opacity:0}}`;
    document.head.appendChild(style);
  }

  // Speed: ~18ms per token gives smooth ChatGPT-like feel
  const DELAY = 18;

  function step() {
    if (i >= tokens.length) {
      // Done — remove cursor, render final HTML properly
      bubble.innerHTML = renderMarkdown(text);
      scrollToBottom();
      if (typeof onDone === 'function') onDone();
      return;
    }
    rendered += tokens[i];
    i++;
    // Re-render with cursor appended
    bubble.innerHTML = renderMarkdown(rendered);
    bubble.appendChild(cursor);
    scrollToBottom();
    setTimeout(step, DELAY);
  }
  step();
}

function scrollToBottom() {
  const area = document.querySelector('.chat-scroll-area');
  if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – Tab switch (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function switchTab(tab) {
  const loginForm  = $('loginForm');
  const signupForm = $('signupForm');
  const tabLogin   = $('tabLogin');
  const tabSignup  = $('tabSignup');
  if (tab === 'login') {
    loginForm.style.display  = 'flex';
    signupForm.style.display = 'none';
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    $('loginError').innerText  = '';
  } else {
    loginForm.style.display  = 'none';
    signupForm.style.display = 'flex';
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    $('signupError').innerText = '';
  }
}

function togglePass(inputId, btn) {
  const inp = $(inputId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.title = show ? 'Hide' : 'Show';
  btn.style.opacity = show ? '1' : '0.5';
}

function checkPwdStrength(val) {
  const bar = $('pwdBar');
  if (!bar) return;

  const ruleLen     = $('rule-len');
  const ruleLetter  = $('rule-letter');
  const ruleDigit   = $('rule-digit');
  const ruleSpecial = $('rule-special');

  const lenOk     = val.length === 10;
  const letterOk  = /[a-zA-Z]/.test(val);
  const digitOk   = /\d/.test(val);
  const specialOk = /[^a-zA-Z0-9]/.test(val);

  setRule(ruleLen,     lenOk,     '✓ Exactly 10 characters',          '✗ Exactly 10 characters');
  setRule(ruleLetter,  letterOk,  '✓ At least 1 letter',              '✗ At least 1 letter');
  setRule(ruleDigit,   digitOk,   '✓ At least 1 number',              '✗ At least 1 number');
  setRule(ruleSpecial, specialOk, '✓ At least 1 special char',        '✗ At least 1 special char');

  const score = [lenOk, letterOk, digitOk, specialOk].filter(Boolean).length;
  const pct   = (score / 4) * 100;
  bar.style.width      = pct + '%';
  bar.style.background = score < 2 ? '#ff6b6b' : score < 4 ? '#f59e0b' : '#10a37f';
}

function setRule(el, ok, okText, failText) {
  if (!el) return;
  el.innerText = ok ? okText : failText;
  el.classList.toggle('ok', ok);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── In-memory fallback store (works even when localStorage is blocked) ──
const _memStore = {};
function _lsGet(key) {
  try { const v = localStorage.getItem(key); return v; } catch { return _memStore[key] || null; }
}
function _lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
  _memStore[key] = val;
}
function _lsRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  delete _memStore[key];
}

function getStoredUsers() {
  try { return JSON.parse(_lsGet('ranai_users') || '{}'); } catch { return {}; }
}
function saveStoredUsers(users) {
  _lsSet('ranai_users', JSON.stringify(users));
}

/* ═══════════════════════════════════════════════════════════════════════
   PERSISTENT MEMORY SYSTEM
   - saveMessage(role, text)  — saves to per-user memory (max 10 pairs)
   - loadMemory()             — returns array of {role,text} objects
   - clearMemory()            — wipes all stored memory for current user
   - getMemoryKey()           — computes the localStorage key
   - buildMemoryPrompt()      — formats memory as prompt context string
═══════════════════════════════════════════════════════════════════════ */

function getMemoryKey() {
  const email = currentUser ? currentUser.email : 'guest';
  return 'ranai_memory_' + email;
}

/**
 * Load the last 10 conversation pairs from persistent memory.
 * Returns an array of { role: 'user'|'ai', text: string } objects.
 */
function loadMemory() {
  try {
    const raw = _lsGet(getMemoryKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(m => m && typeof m.role === 'string' && typeof m.text === 'string');
  } catch {
    return [];
  }
}

/**
 * Save a single message to persistent memory.
 * Prevents duplicate consecutive entries. Keeps max 20 entries (10 pairs).
 */
function saveMessage(role, text) {
  if (!text || typeof text !== 'string') return;
  const cleanText = text.trim();
  if (!cleanText) return;

  const memory = loadMemory();

  // Prevent duplicate consecutive entry
  if (memory.length > 0) {
    const last = memory[memory.length - 1];
    if (last.role === role && last.text === cleanText) return;
  }

  memory.push({ role, text: cleanText, ts: Date.now() });

  // Keep only last 20 entries (10 user+ai pairs)
  const trimmed = memory.slice(-20);

  try {
    _lsSet(getMemoryKey(), JSON.stringify(trimmed));
  } catch {
    // If storage quota exceeded, drop oldest half and retry
    try {
      _lsSet(getMemoryKey(), JSON.stringify(trimmed.slice(-10)));
    } catch { /* ignore */ }
  }
}

/**
 * Clear all memory for the current user.
 */
function clearMemory() {
  _lsRemove(getMemoryKey());
}

/**
 * Build a concise memory context string to inject into the AI prompt.
 * Uses user's name for personalisation if available.
 */
function buildMemoryPrompt() {
  const memory = loadMemory();
  if (!memory.length) return '';

  const userName = currentUser ? (currentUser.firstName || currentUser.name || '') : '';
  const nameHint = userName ? `The user's name is ${userName}. ` : '';

  const lines = memory.map(m => {
    const label = m.role === 'user' ? (userName || 'User') : 'RanAI';
    return `${label}: ${m.text}`;
  }).join('\n');

  return `\n\n--- MEMORY (previous conversations) ---\n${nameHint}${lines}\n--- END MEMORY ---`;
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTH HANDLERS
═══════════════════════════════════════════════════════════════════════ */
function handleLogin() {
  const email    = ($('loginEmail').value    || '').trim().toLowerCase();
  const password = ($('loginPassword').value || '');
  const errEl    = $('loginError');

  errEl.innerText = '';

  if (!email)                { errEl.innerText = 'Please enter your email.';    return; }
  if (!isValidEmail(email))  { errEl.innerText = 'Please enter a valid email.'; return; }
  if (!password)             { errEl.innerText = 'Please enter your password.'; return; }

  const users = getStoredUsers();
  const user  = users[email];

  if (!user)                       { errEl.innerText = 'No account found. Please sign up.'; return; }
  if (user.password !== password)  { errEl.innerText = 'Incorrect password. Try again.';    return; }

  loginSuccess(user);
}

function handleSignup() {
  const firstName = ($('signupFirst').value  || '').trim();
  const lastName  = ($('signupLast').value   || '').trim();
  const email     = ($('signupEmail').value  || '').trim().toLowerCase();
  const password  = ($('signupPassword').value || '');
  const errEl     = $('signupError');

  errEl.innerText = '';

  if (!firstName)             { errEl.innerText = 'Please enter your first name.';    return; }
  if (!lastName)              { errEl.innerText = 'Please enter your last name.';     return; }
  if (!email)                 { errEl.innerText = 'Please enter your email.';         return; }
  if (!isValidEmail(email))   { errEl.innerText = 'Please enter a valid email.';      return; }
  if (password.length !== 10) { errEl.innerText = 'Password must be exactly 10 characters.'; return; }
  if (!/[a-zA-Z]/.test(password)) { errEl.innerText = 'Password must contain at least 1 letter.'; return; }
  if (!/\d/.test(password))       { errEl.innerText = 'Password must contain at least 1 number.'; return; }
  if (!/[^a-zA-Z0-9]/.test(password)) { errEl.innerText = 'Password must contain at least 1 special character.'; return; }

  const users = getStoredUsers();
  if (users[email]) { errEl.innerText = 'An account with this email already exists. Please sign in.'; return; }

  const newUser = {
    firstName,
    lastName,
    name:  firstName + ' ' + lastName,
    email,
    password,
    createdAt: new Date().toISOString()
  };
  users[email] = newUser;
  saveStoredUsers(users);

  loginSuccess(newUser);
}

function loginSuccess(user) {
  currentUser = user;
  _lsSet('ranai_session', JSON.stringify({ email: user.email }));

  // Persist user name in memory profile for context awareness
  _lsSet('ranai_user_name_' + user.email, user.firstName || user.name || '');

  const authScreen = $('authScreen');
  authScreen.style.transition = 'opacity 0.4s';
  authScreen.style.opacity    = '0';
  setTimeout(() => { authScreen.style.display = 'none'; }, 400);

  const main = $('main');
  main.style.display = 'flex';

  updateUserUI();
  loadConversationsFromLocalStorage();
  initSidebar();
  initModelDropdown();
  initUserMenu();
  initAttachments();
  initToolBtns();
  initEventListeners();
  initConversationEvents();

  showToast('Welcome back, ' + user.firstName + '! 👋');
}

function checkSavedSession() {
  try {
    const session = JSON.parse(_lsGet('ranai_session') || 'null');
    if (!session || !session.email) return false;
    const users = getStoredUsers();
    const user  = users[session.email];
    if (!user) return false;
    currentUser = user;
    return true;
  } catch { return false; }
}

function logout() {
  _lsRemove('ranai_session');
  currentUser = null;
  conversations = [];
  currentConversationId = null;

  $('main').style.display = 'none';
  const auth = $('authScreen');
  auth.style.display   = 'flex';
  auth.style.opacity   = '0';
  auth.style.transition = 'opacity 0.3s';
  setTimeout(() => { auth.style.opacity = '1'; }, 10);

  $('loginEmail').value    = '';
  $('loginPassword').value = '';
  $('loginError').innerText = '';
  switchTab('login');
}

function updateUserUI() {
  if (!currentUser) return;
  const displayName = currentUser.name || currentUser.firstName || 'User';
  const email       = currentUser.email || '';
  const shortName   = currentUser.firstName || displayName;

  const sidebarName = $('sidebarUserName');
  if (sidebarName) sidebarName.innerText = shortName;

  const ddName  = $('userDdName');
  const ddEmail = $('userDdEmail');
  if (ddName)  ddName.innerText  = displayName;
  if (ddEmail) ddEmail.innerText = email;

  const letter    = (currentUser.firstName || 'U').charAt(0).toUpperCase();
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(letter)}&background=10a37f&color=fff`;

  const sidebarAvatar = $('sidebarUserAvatar');
  if (sidebarAvatar) sidebarAvatar.src = avatarUrl;

  const topbarImg = $('topbarAvatarImg');
  if (topbarImg) topbarImg.src = avatarUrl;

  const ddAvatar = $('userDdAvatar');
  if (ddAvatar) ddAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=10a37f&color=fff&size=80`;
}

function getCurrentTimeInIndia() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5*3600000);
  let h = ist.getUTCHours(), m = ist.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return { hours: h % 12 || 12, minutes: String(m).padStart(2,'0'), ampm };
}

function normaliseHinglish(text) {
  const map = [
    [/\bkha\b/g,   'kahan'],
    [/\bkr\b/g,    'kar'],
    [/\bkrna\b/g,  'karna'],
    [/\bkrte\b/g,  'karte'],
    [/\bkrta\b/g,  'karta'],
    [/\bbt\b/g,    'baat'],
    [/\bbtao\b/g,  'batao'],
    [/\bbtana\b/g, 'batana'],
    [/\bh\b/g,     'hai'],
    [/\bhn\b/g,    'hain'],
    [/\brha\b/g,   'raha'],
    [/\brhe\b/g,   'rahe'],
    [/\bthk\b/g,   'theek'],
    [/\bacha\b/g,  'accha'],
    [/\bpls\b/g,   'please'],
    [/\bplz\b/g,   'please'],
    [/\bkyu\b/g,   'kyun'],
    [/\bkyun\b/g,  'kyun'],
    [/\bnhi\b/g,   'nahi'],
    [/\bnai\b/g,   'nahi'],
    [/\bhlo\b/g,   'hello'],
    [/\bhii\b/g,   'hi'],
    [/\bthx\b/g,   'thanks'],
    [/\bthnks\b/g, 'thanks'],
    [/\baap\b/g,   'aap'],
    [/\bmujhe\b/g, 'mujhe'],
    [/\bsmjh\b/g,  'samajh'],
    [/\bsmjha\b/g, 'samjha'],
  ];
  let t = text.toLowerCase();
  for (const [pat, rep] of map) t = t.replace(pat, rep);
  return t;
}

function detectLanguage(text) {
  const t = text.trim();
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  if (/[\u0980-\u09FF]/.test(t)) return 'bn';
  if (/[\u0B80-\u0BFF]/.test(t)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(t)) return 'te';
  if (/[\u0A80-\u0AFF]/.test(t)) return 'gu';
  if (/[\u0A00-\u0A7F]/.test(t)) return 'pa';
  if (/\b(namaste|kaise|kya|haal|chal|thik|bahut|mujhe|aap|main|btao|shukriya|dhanyawad|nahi|nhi|kyun|kab|kahan|kha|kaun|mera|tera|hum|tum|bhai|dost|accha|theek|yaar|yar|bol|bolo|kar|karo|kr|krna|hai|hain|tha|thi|the|raha|rahe|ho|hoga|bilkul|zaroor|arrey|arre|abhi|phir|warna|lekin|aur|matlab|samjha|smjh|lagta|lagti|chahiye|chahte|zyada|thoda|bohot|bahut|seedha|sidha|pata|baat|bt)\b/i.test(t))
    return 'hi';
  return 'en';
}

/* ═══════════════════════════════════════════════════════════════════════
   HUMAN-LIKE RESPONSES (exact name/creator)
═══════════════════════════════════════════════════════════════════════ */
function getHumanResponse(userMsg, lang) {
  const lower   = userMsg.toLowerCase().trim();
  const normed  = normaliseHinglish(lower);

  if (/(what is your name|your name|tumhara naam|aapka naam|tera naam|naam kya|name kya)/i.test(normed)) {
    return "Mera naam RanAI hai aur mujhe Ranjit ke dwara banaya gaya hai.";
  }
  if (/(who (made|created|built) you|tumko kisne banaya|kisne banaya|creator|developer)/i.test(normed)) {
    return "Mujhe Ranjit ne banaya hai.";
  }

  if (/kitna baj|time kya|baj raha|baj rhe|what time|time batao|time bta/.test(normed)) {
    const { hours, minutes, ampm } = getCurrentTimeInIndia();
    const timeStr = `${hours}:${minutes} ${ampm}`;
    if (lang === 'hi') return `अभी भारत में ${timeStr} बज रहे हैं। 😊 कुछ और पूछना है?`;
    return `It's currently ${timeStr} in India. 😊 Anything else?`;
  }

  if (/kya kar rahe|kya kr rhe|what are you doing|kya karta/.test(normed)) {
    const replies = {
      hi:  ["बस आपसे बात कर रहा हूँ! 😊", "आपकी मदद के लिए तैयार हूँ यार।", "bas chill maar raha tha, tu bata kya scene hai? 😄"],
      bn:  ["আপনার সাথে কথা বলছি! 😊"],
      ta:  ["உங்களுடன் பேசுகிறேன்! 😊"],
      en:  ["Just chatting with you! 😊", "Ready to help, always 💪", "Chilling and waiting for your next question 😄"],
    };
    const list = replies[lang] || replies.en;
    return list[Math.floor(Math.random() * list.length)];
  }

  if (/^(hi|hello|hey|namaste|hlo|hii|hola|salaam|salam|vanakkam|namaskar|kem cho|sat sri akal|jai shri krishna|jai hind|ram ram)/.test(normed)) {
    const userName = currentUser ? (currentUser.firstName || '') : '';
    const nameGreet = userName ? `, ${userName}` : '';
    const replies = {
      hi:  [`नमस्ते${nameGreet}! 😊 मैं RanAi हूँ। कुछ पूछना है?`, `हैलो यार${nameGreet}! कैसे मदद करूँ? 😄`, `अरे${nameGreet}, आ गए! बोलो क्या चाहिए? 😊`],
      bn:  [`নমস্কার${nameGreet}! 😊 আমি RanAi। কীভাবে সাহায্য করতে পারি?`],
      ta:  [`வணக்கம்${nameGreet}! 😊 நான் RanAi. எப்படி உதவலாம்?`],
      en:  [`Hello${nameGreet}! 👋 I'm RanAi. How can I help?`, `Hey${nameGreet}! 😊 Ask me anything!`, `Yo${nameGreet}! What's up? I'm here to help 😄`],
    };
    const list = replies[lang] || replies.en;
    return list[Math.floor(Math.random() * list.length)];
  }

  if (/how are you|kaise ho|kya haal|kya chal|sab theek|thik ho|kaisa chal/.test(normed)) {
    if (lang === 'hi') return "बिल्कुल ठीक हूँ यार! तू बता कैसा है? 😊";
    if (lang === 'bn') return "আমি ভালো আছি! আপনি কেমন আছেন? 😊";
    return "Doing great, thanks! You tell me? 😊";
  }

  if (/thank|shukriya|dhanyawad|धन्यवाद|nandri|dhanks/.test(normed)) {
    if (lang === 'hi') return "अरे, इसमें क्या! आपका स्वागत है 😊";
    if (lang === 'bn') return "স্বাগতম! 😊";
    return "You're welcome! Anytime 😊";
  }

  if (/good morning|subah|suprabhat/.test(normed)) {
    if (lang === 'hi') return "सुप्रभात! ☀️ आज का दिन बढ़िया जाए।";
    return "Good morning! ☀️ Have a great day!";
  }
  if (/good night|shubh ratri/.test(normed)) {
    if (lang === 'hi') return "शुभ रात्रि! 🌙 अच्छे सपने आएं।";
    return "Good night! 🌙 Sweet dreams!";
  }

  if (/(i love you|love you|main tumse pyar|pyar karta|mujhe pasand)/i.test(normed)) {
    if (lang === 'hi') return "ओहो! 😊 शुक्रिया! ❤️ Yaar, AI se pyar? Lucky ho tum!";
    return "Oh! 😊 Thank you! ❤️ That's sweet!";
  }

  if (/(bored|bore ho|kuch nahi|kya karu|pagal ho|dimag kharab)/i.test(normed)) {
    if (lang === 'hi') return "Arrey bore mat ho yaar! Kuch interesting baat karte hain — koi topic batao 😄";
    return "Don't be bored! Let's talk about something interesting 😄";
  }

  if (lang === 'hi') return "मैं यहाँ हूँ! 😊 कुछ भी पूछो, बताऊँगा।";
  if (lang === 'bn') return "আমি এখানে আছি! 😊 যা ইচ্ছে জিজ্ঞেস করুন।";
  if (lang === 'ta') return "நான் இங்கே இருக்கிறேன்! 😊 எதையும் கேளுங்கள்.";
  return "I'm here! 😊 Go ahead and ask me anything.";
}

/* ═══════════════════════════════════════════════════════════════════════
   VOICE & SPEECH (unchanged)
═══════════════════════════════════════════════════════════════════════ */
const RANAI_SYSTEM_PROMPT = `
You are RanAI, a smart voice assistant that speaks responses aloud using SpeechSynthesis.

INPUT UNDERSTANDING
- User input may have wrong spelling
- It may be Hindi, Hinglish, or English
- Sentences may be incomplete

Understand the meaning, not grammar.
Do NOT mention spelling corrections.

VOICE OUTPUT OPTIMIZATION
Your response will be spoken using SpeechSynthesis.

So ALWAYS:
- Use short sentences, 8 to 12 words
- Use simple everyday language
- Avoid complex words
- Avoid symbols, markdown, or special characters
- Avoid long paragraphs
- Use commas for natural pauses
- Make sentences easy to speak and listen

IMPORTANT LANGUAGE RULE
- If user speaks in Hindi, reply in Hindi
- If user speaks in Hinglish, reply in Hinglish
- If user speaks in English, reply in English
- Prefer spoken Hindi words that sound natural aloud
- Keep Hindi replies simple and conversational

STYLE
- Talk like a real human
- Friendly and natural
- No robotic tone
- No unnecessary emojis
- No formatting

MEMORY
- Use previous messages context
- Keep conversation natural
- Address the user by their name when appropriate

GOAL
Generate responses that sound natural when spoken aloud using SpeechSynthesis.
`;

function sanitizeSpeechText(text) {
  return (text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/[`#>*_~]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickBestVoice(lang, voices) {
  if (!voices || !voices.length) return null;
  if (lang === 'hi') {
    return (
      voices.find(v => /^hi(-|_)?IN$/i.test(v.lang)) ||
      voices.find(v => /hindi/i.test(v.name)) ||
      voices.find(v => /india/i.test(v.name)) ||
      null
    );
  }
  return (
    voices.find(v => /^en(-|_)?IN$/i.test(v.lang)) ||
    voices.find(v => /^en(-|_)?GB$/i.test(v.lang)) ||
    voices.find(v => /^en(-|_)?US$/i.test(v.lang)) ||
    voices.find(v => /english/i.test(v.name)) ||
    null
  );
}

// ── Active TTS audio element (for stop support) ──
let _ttsAudio = null;

/**
 * speakReply(text)
 * 3-layer TTS system:
 *   Layer 1 → Server /tts endpoint (Google TTS, best Hindi quality)
 *   Layer 2 → Browser SpeechSynthesis with hi-IN voice (if available)
 *   Layer 3 → Browser SpeechSynthesis with any available voice (last resort)
 */
async function speakReply(text) {
  if (!text) return;
  const spokenText = sanitizeSpeechText(text);
  if (!spokenText) return;

  const lang = detectLanguage(spokenText);

  // Stop any currently playing audio
  if (_ttsAudio) { try { _ttsAudio.pause(); _ttsAudio = null; } catch(e) {} }
  if (window.speechSynthesis) window.speechSynthesis.cancel();

  // ── Layer 1: Server /tts (Google Translate TTS – best Hindi voice) ──
  try {
    const ttsLang = lang === 'hi' ? 'hi' : 'en';
    const res = await fetch(`${API}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spokenText, lang: ttsLang }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      _ttsAudio = new Audio(audioUrl);
      _ttsAudio.onended = () => { URL.revokeObjectURL(audioUrl); _ttsAudio = null; };
      _ttsAudio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        _ttsAudio = null;
        _speakWithBrowser(spokenText, lang);
      };
      await _ttsAudio.play();
      return;
    }

    // Server returned non-OK – check for useBrowserTTS flag
    const data = await res.json().catch(() => ({}));
    if (data.useBrowserTTS) {
      _speakWithBrowser(data.text || spokenText, lang);
      return;
    }
  } catch (serverErr) {
    console.warn('[TTS] Server TTS failed, using browser fallback:', serverErr.message);
  }

  // ── Layer 2 & 3: Browser SpeechSynthesis fallback ──
  _speakWithBrowser(spokenText, lang);
}

/**
 * _speakWithBrowser(text, lang)
 * Internal: Web Speech API with hi-IN or best available voice.
 */
function _speakWithBrowser(text, lang) {
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang   = lang === 'hi' ? 'hi-IN' : 'en-IN';
  utterance.rate   = 1.0;
  utterance.pitch  = 1.0;
  utterance.volume = 1.0;

  const doSpeak = () => {
    const voices = synth.getVoices();
    const chosenVoice = pickBestVoice(lang, voices);
    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang  = chosenVoice.lang;
    }
    try { synth.speak(utterance); } catch(e) { console.warn('[TTS] Browser speak error:', e.message); }
  };

  const voices = synth.getVoices();
  if (voices.length) { doSpeak(); }
  else {
    const handler = () => { synth.removeEventListener('voiceschanged', handler); doSpeak(); };
    synth.addEventListener('voiceschanged', handler);
  }
}

function stopVoice() {
  // Stop server TTS audio
  if (_ttsAudio) {
    try { _ttsAudio.pause(); _ttsAudio.currentTime = 0; } catch(e) {}
    _ttsAudio = null;
  }
  // Stop browser SpeechSynthesis
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  showToast('Voice stopped ⏹️', 1500);
}

/* ═══════════════════════════════════════════════════════════════════════
   OCR: Extract text from image using Tesseract.js
═══════════════════════════════════════════════════════════════════════ */
async function extractTextFromImage(imageFile) {
  if (!Tesseract) {
    await loadTesseract();
    if (!Tesseract) throw new Error('Tesseract not available');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const { data: { text } } = await Tesseract.recognize(e.target.result, 'hin+eng', { logger: m => console.log(m) });
        resolve(text.trim());
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(imageFile);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   RETRY & NETWORK FIX – NEW fetchWithRetry function
═══════════════════════════════════════════════════════════════════════ */
async function fetchWithRetry(url, options, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Fetch] Attempt ${attempt}/${maxRetries} for ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);
      const fetchOptions = { ...options, signal: controller.signal };
      delete fetchOptions.timeout;
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (err) {
      lastError = err;
      console.warn(`[Fetch] Attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/* ═══════════════════════════════════════════════════════════════════════
   SEND MESSAGE TO AI – with memory injection and retries
═══════════════════════════════════════════════════════════════════════ */
async function sendMessageToAI(question) {
  const lang   = detectLanguage(question);
  const normed = normaliseHinglish(question.toLowerCase().trim());

  // Local pattern matching (fast)
  const casualPattern = /kitna baj|time kya|baj raha|baj rhe|time batao|what time|kya kar rahe|kya kr rhe|what are you doing|^(hi|hello|hey|hlo|hii|namaste|salaam|salam|vanakkam)|how are you|kaise ho|kya haal|sab theek|thik ho|kaisa chal|thank|shukriya|dhanyawad|good morning|good night|subah|shubh ratri|what is your name|your name|tumhara naam|naam kya|who made you|kisne banaya|i love you|love you|main tumse pyar|bored|bore ho/i;

  showTyping();

  if (casualPattern.test(normed)) {
    await sleep(150);
    hideTyping();
    const reply = getHumanResponse(question, lang);
    addMessage('ai', reply);
    // Save to persistent memory
    saveMessage('user', question);
    saveMessage('ai', reply);
    return;
  }

  // ── Build conversation context from current conversation ──
  const conv = conversations.find(c => c.id === currentConversationId);
  const history = conv ? conv.messages.slice(-10) : [];
  const historyText = history.length > 1
    ? history.slice(0, -1).map(m => `${m.role === 'user' ? 'User' : 'RanAI'}: ${m.text}`).join('\n')
    : '';

  // ── Inject persistent memory into prompt ──────────────────
  const memoryContext = buildMemoryPrompt();

  const langSuffix = lang === 'hi'
    ? '\n\nIMPORTANT: The user is speaking Hindi or Hinglish. Reply in natural spoken Hindi or Hinglish. Prefer Hindi when the user speaks Hindi. Use simple spoken words only.'
    : lang !== 'en'
    ? `\n\nIMPORTANT: Reply in the same language the user wrote in, detected language: ${lang}.`
    : '\n\nIMPORTANT: Reply in simple spoken English.';

  // Inject user name for personalised response
  const userName = currentUser ? (currentUser.firstName || currentUser.name || '') : '';
  const userNameHint = userName ? `\n\nThe user's name is ${userName}. Address them by name occasionally for a personal touch.` : '';

  const fullSystemPrompt = RANAI_SYSTEM_PROMPT + langSuffix + userNameHint + memoryContext;

  const userContent = historyText
    ? `Conversation history (last messages):\n${historyText}\n\nUser: ${question}`
    : question;

  // ---- PRIMARY: Pollinations API ----
  let pollinationsSuccess = false;
  try {
    const pollUrl = `https://text.pollinations.ai/${encodeURIComponent(fullSystemPrompt + '\n\n' + userContent)}`;
    const response = await fetchWithRetry(pollUrl, { method: 'GET', timeout: 8000 }, 2, 1000);
    const answer = await response.text();
    if (answer && answer.length > 5) {
      hideTyping();
      addMessage('ai', answer);
      // Save to persistent memory
      saveMessage('user', question);
      saveMessage('ai', answer);
      pollinationsSuccess = true;
      return;
    }
  } catch (pollErr) {
    console.error('[Pollinations] All retries failed:', pollErr.message);
  }

  if (!pollinationsSuccess) {
    // ---- FALLBACK: Backend API ----
    try {
      const backendUrl = `${API}/ask`;
      const modifiedQuestion = lang === 'hi' ? question + ' (कृपया हिंदी में उत्तर दें)' : question;

      const conv = conversations.find(c => c.id === currentConversationId);
      const historyMessages = conv
        ? conv.messages.slice(-10).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text || ''
          }))
        : [];

      // Also append persistent memory to backend history
      const memoryMessages = loadMemory().map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }));
      const combinedHistory = [...memoryMessages.slice(-10), ...historyMessages].slice(-20);

      const response = await fetchWithRetry(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: modifiedQuestion,
          model: currentModel,
          lang,
          history: combinedHistory,
          userName: userName
        }),
        timeout: 20000
      }, 3, 1500);
      const data = await response.json();
      hideTyping();
      let answer = data.reply || 'Sorry, the AI did not return a valid response.';
      if (lang === 'hi' && !/[\u0900-\u097F]/.test(answer)) {
        answer = await translateText(answer, 'hi');
      }
      addMessage('ai', answer);
      // Save to persistent memory
      saveMessage('user', question);
      saveMessage('ai', answer);
    } catch (finalErr) {
      hideTyping();
      console.error('[Backend] Final error:', finalErr);
      let userMessage = '';
      if (finalErr.name === 'AbortError' || finalErr.message.includes('timeout')) {
        userMessage = '⏰ Server is waking up (cold start) or taking too long. Please wait 30 seconds and try again.';
      } else if (finalErr.message.includes('CORS')) {
        userMessage = '❌ CORS error: The backend is not allowing requests from this domain. Contact the developer.';
      } else if (finalErr.message.includes('HTTP 503') || finalErr.message.includes('500')) {
        userMessage = '⚠️ Backend server error (5xx). It might be down. Please try later.';
      } else if (finalErr.message.includes('Failed to fetch')) {
        userMessage = '🌐 Network error: Cannot reach the server. Check your internet or the backend URL.';
      } else {
        userMessage = `❌ ${finalErr.message}`;
      }
      addMessage('ai', userMessage);
    }
  }
}

async function translateText(text, targetLang) {
  if (targetLang !== 'hi') return text;
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|hi`);
    const data = await res.json();
    if (data && data.responseData && data.responseData.translatedText) return data.responseData.translatedText;
  } catch (e) {}
  return text;
}

// ═══════════════════════════════════════════════════════════════════════
// POLLINATIONS IMAGE GENERATION (unchanged)
// ═══════════════════════════════════════════════════════════════════════

function isImagePrompt(text) {
  return /\b(draw|image|generate|photo|picture|create|make|paint|sketch|design|illustration)\b/i.test(text);
}

function addImageLoadingBubble() {
  const hero      = $('hero');
  const container = $('chatMessages');
  if (!container) return null;
  if (hero && hero.style.display !== 'none') {
    hero.style.display = 'none';
    container.classList.add('show');
    container.style.display = 'flex';
  }
  const row = document.createElement('div');
  row.className = 'message-row ai';
  const avatar = document.createElement('img');
  avatar.className = 'message-avatar';
  avatar.src = 'LOGO.png';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble gen-bubble';
  bubble.innerHTML = `
    <div class="img-loading">
      <span class="img-spinner"></span>
      <span>Generating image…</span>
    </div>`;
  row.appendChild(avatar);
  row.appendChild(bubble);
  container.appendChild(row);
  scrollToBottom();
  return bubble;
}

function fillImageBubble(bubble, imageUrl, prompt) {
  bubble.innerHTML = `
    <div class="gen-img-wrap">
      <img class="gen-img" src="${imageUrl}" alt="${escapeHtml(prompt)}" />
      <p class="gen-caption">🎨 ${escapeHtml(prompt)}</p>
      <div class="gen-img-actions">
        <a class="img-dl-btn" href="${imageUrl}" download="ranai-image.jpg" target="_blank" rel="noopener noreferrer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </a>
        <button class="img-copy-btn" onclick="copyImageUrl('${imageUrl}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copy Link
        </button>
      </div>
    </div>`;
  scrollToBottom();
  if (currentConversationId) {
    const conv = conversations.find(c => c.id === currentConversationId);
    if (conv) {
      conv.messages.push({ role: 'ai', text: `🖼️ Generated image: "${prompt}"` });
      saveConversationsToLocalStorage();
      renderConversationList();
    }
  }
}

function copyImageUrl(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('Image link copied! 🔗'));
  } else {
    showToast('Copy not supported on this browser.');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Smart Image Enhancement (Pollinations-based + Canvas fallback)
// ═══════════════════════════════════════════════════════════════════════

const ENHANCE_KEYWORDS = /\b(enhance|improve|clean|hd|clear|beautify|saaf|quality|sharp|sharpness|upgrade|upscale|better|fix|restore|crisp|vivid|bright|clearer|badhao|accha|theek karo|saaf karo|hd karo|better bana|acha bana|improve karo|quality badhao)\b/i;

function isEnhanceIntent(msg) {
  return ENHANCE_KEYWORDS.test(msg);
}

function canvasEnhance(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const W = img.naturalWidth  || img.width;
        const H = img.naturalHeight || img.height;

        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, W, H);

        const src = ctx.getImageData(0, 0, W, H);
        const d   = src.data;
        const contrast  = 1.25;
        const brightness = 12;
        const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
        for (let i = 0; i < d.length; i += 4) {
          d[i]   = Math.min(255, Math.max(0, factor * (d[i]   - 128) + 128 + brightness));
          d[i+1] = Math.min(255, Math.max(0, factor * (d[i+1] - 128) + 128 + brightness));
          d[i+2] = Math.min(255, Math.max(0, factor * (d[i+2] - 128) + 128 + brightness));
        }
        ctx.putImageData(src, 0, 0);

        const imgData = ctx.getImageData(0, 0, W, H);
        const inp = imgData.data;
        const out = new Uint8ClampedArray(inp.length);
        const kernel = [0,-1,0,-1,5,-1,0,-1,0];
        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            let r = 0, g = 0, b = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const pi  = ((y + ky) * W + (x + kx)) * 4;
                const ki  = (ky + 1) * 3 + (kx + 1);
                r += inp[pi]   * kernel[ki];
                g += inp[pi+1] * kernel[ki];
                b += inp[pi+2] * kernel[ki];
              }
            }
            const oi = (y * W + x) * 4;
            out[oi]   = Math.min(255, Math.max(0, r));
            out[oi+1] = Math.min(255, Math.max(0, g));
            out[oi+2] = Math.min(255, Math.max(0, b));
            out[oi+3] = inp[oi+3];
          }
        }
        for (let i = 0; i < inp.length; i += 4) {
          const x = (i / 4) % W, y = Math.floor((i / 4) / W);
          if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
            out[i] = inp[i]; out[i+1] = inp[i+1];
            out[i+2] = inp[i+2]; out[i+3] = inp[i+3];
          }
        }
        imgData.data.set(out);
        ctx.putImageData(imgData, 0, 0);

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function addEnhanceBubble() {
  const hero      = $('hero');
  const container = $('chatMessages');
  if (!container) return null;
  if (hero && hero.style.display !== 'none') {
    hero.style.display = 'none';
    container.classList.add('show');
    container.style.display = 'flex';
  }
  const row    = document.createElement('div');
  row.className = 'message-row ai';
  const avatar  = document.createElement('img');
  avatar.className = 'message-avatar';
  avatar.src = 'LOGO.png';
  const bubble  = document.createElement('div');
  bubble.className = 'message-bubble gen-bubble';
  bubble.innerHTML = `
    <div class="img-loading">
      <span class="img-spinner"></span>
      <span>✨ Enhancing image…</span>
    </div>`;
  row.appendChild(avatar);
  row.appendChild(bubble);
  container.appendChild(row);
  scrollToBottom();
  return bubble;
}

function fillEnhanceBubble(bubble, dataUrl, isCanvas) {
  const label   = isCanvas ? '🖼️ Enhanced (local processing)' : '✨ Enhanced Image';
  const dlHref  = dataUrl;
  const dlName  = isCanvas ? 'enhanced-local.png' : 'enhanced-ranai.jpg';

  bubble.innerHTML = `
    <div class="gen-img-wrap">
      <p class="gen-caption" style="margin-bottom:6px">${label}</p>
      <img class="gen-img" src="${escapeHtml(dataUrl)}" alt="Enhanced image" style="cursor:pointer" />
      <div class="gen-img-actions">
        <a class="img-dl-btn" href="${escapeHtml(dlHref)}" download="${dlName}" target="_blank" rel="noopener noreferrer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </a>
        ${!isCanvas ? `<button class="img-copy-btn" onclick="copyImageUrl('${escapeHtml(dataUrl)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copy Link
        </button>` : ''}
      </div>
      ${isCanvas ? '<p style="font-size:11px;color:var(--text-3);margin-top:4px">⚠️ Pollinations unavailable – applied local sharpening &amp; contrast boost</p>' : ''}
    </div>`;
  scrollToBottom();
  if (currentConversationId) {
    const conv = conversations.find(c => c.id === currentConversationId);
    if (conv) {
      conv.messages.push({ role: 'ai', text: label });
      saveConversationsToLocalStorage();
      renderConversationList();
    }
  }
}

async function handleImageEnhancement(file) {
  const bubble = addEnhanceBubble();

  try {
    const ext  = (file.name.split('.').pop() || 'image').toLowerCase();
    const seed = Date.now();

    const prompt = encodeURIComponent(
      `High quality enhanced HD photo, ultra sharp, high resolution, clean details, ` +
      `professional color grading, noise removed, bright and vivid, realistic, 4K quality, ` +
      `photo enhancement, ${ext} format, photorealistic, best quality, masterpiece`
    );
    const pollUrl = `https://image.pollinations.ai/prompt/${prompt}?nologo=true&width=1024&height=768&seed=${seed}&enhance=true`;

    await new Promise((resolve, reject) => {
      const img   = new Image();
      const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, 12000);
      img.onload  = () => { clearTimeout(timer); resolve(); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
      img.src = pollUrl;
    });

    if (bubble) fillEnhanceBubble(bubble, pollUrl, false);
    return;

  } catch (pollErr) {
    console.warn('[Enhancement] Pollinations failed, using Canvas fallback:', pollErr.message);
  }

  try {
    const dataUrl = await canvasEnhance(file);
    if (bubble) fillEnhanceBubble(bubble, dataUrl, true);
  } catch (canvasErr) {
    console.error('[Enhancement] Canvas fallback failed:', canvasErr);
    if (bubble) bubble.innerHTML = '<span class="poll-error">❌ Enhancement failed. Please try again.</span>';
    scrollToBottom();
  }
}

// ── Real-person / celebrity detection ────────────────────────────────
const REAL_PERSON_PATTERN = /\b(aishwarya|aishwarya rai|shahrukh|shah rukh|salman|deepika|priyanka|katrina|anushka|alia|ranveer|akshay|hrithik|amitabh|ranbir|kareena|sonam|vidya|kangana|sundar pichai|elon musk|jeff bezos|bill gates|mark zuckerberg|modi|obama|trump|biden|putin|taylor swift|beyonce|rihanna|drake|eminem|brad pitt|angelina|jennifer aniston|tom cruise|leonardo|sachin|virat|rohit|ms dhoni|neymar|messi|ronaldo|cristiano)\b/i;

async function handleImageGeneration(prompt) {
  if (REAL_PERSON_PATTERN.test(prompt)) {
    if (bubble_ref_hack) {/* noop */}
    const hero      = $('hero');
    const container = $('chatMessages');
    if (hero && hero.style.display !== 'none') {
      hero.style.display = 'none';
      container.classList.add('show');
      container.style.display = 'flex';
    }
    const lang = detectLanguage(prompt);
    const msg = lang === 'hi'
      ? '⚠️ Sorry yaar, real celebrities ya public figures ki image generate karna possible nahi hai — privacy aur copyright ki wajah se. Koi aur cheez generate karwao jaise landscapes, art, fantasy characters, etc.!'
      : '⚠️ Sorry! Generating images of real celebrities or public figures is not allowed due to privacy & copyright restrictions. Try something like a fantasy character, landscape, animal, abstract art, etc.!';
    addMessage('ai', msg);
    shouldSpeakNextReply = false;
    return;
  }

  const bubble = addImageLoadingBubble();

  const seeds = [Date.now(), Math.floor(Math.random()*99999), 42];
  let lastErr = null;

  for (const seed of seeds) {
    const encoded  = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?nologo=true&width=768&height=512&seed=${seed}&enhance=true`;
    try {
      await new Promise((resolve, reject) => {
        const img   = new Image();
        const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, 15000);
        img.onload  = () => { clearTimeout(timer); resolve(); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
        img.src = imageUrl;
      });
      if (bubble) fillImageBubble(bubble, imageUrl, prompt);
      shouldSpeakNextReply = false;
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[Image Gen] seed ${seed} failed:`, err.message);
    }
  }

  console.error('[Image Gen] All retries failed:', lastErr && lastErr.message);
  const lang = detectLanguage(prompt);
  const errMsg = lang === 'hi'
    ? '❌ Image generate nahi ho saka. Thodi der baad try karo ya prompt thoda change karo.'
    : '❌ Image generation failed. Please try a different prompt or try again in a moment.';
  if (bubble) bubble.innerHTML = `<span class="poll-error">${errMsg}</span>`;
  scrollToBottom();
  shouldSpeakNextReply = false;
}
const bubble_ref_hack = null;

/* ═══════════════════════════════════════════════════════════════════════
   IMAGE → AI PIPELINE
   PRIMARY  : POST /image-chat  (Gemini Vision — always answers)
   FALLBACK1: OCR (Tesseract) + /ask  (for text-heavy images)
   FALLBACK2: POST /analyze    (DeepAI + Tavily)
   RULES:
   - NEVER say "I cannot see the image"
   - If no question → auto-describe image
   - Voice output only fires if caller sets shouldSpeakNextReply = true
═══════════════════════════════════════════════════════════════════════ */
async function sendImageToAI(imageFile, textQuery) {
  showTyping();

  const lang = detectLanguage(textQuery || '');

  // ── PRIMARY: /image-chat  (Gemini Vision) ────────────────────────
  try {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (textQuery && textQuery.trim()) formData.append('query', textQuery.trim());
    formData.append('lang', lang);

    const res = await fetch(`${API}/image-chat`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.answer && data.answer.trim().length > 4) {
        hideTyping();
        let answer = data.answer;
        // Translate to Hindi if user spoke Hindi and response came back English
        if (lang === 'hi' && !/[\u0900-\u097F]/.test(answer)) {
          answer = await translateText(answer, 'hi');
        }
        addMessage('ai', answer);
        saveMessage('ai', answer);
        return;
      }
    }
  } catch (primaryErr) {
    console.warn('[sendImageToAI] /image-chat failed:', primaryErr.message);
  }

  // ── FALLBACK 1: OCR → /ask  (works well for text-heavy images) ──
  try {
    const extractedText = await extractTextFromImage(imageFile);
    if (extractedText && extractedText.trim().length > 10) {
      const combinedQ = textQuery && textQuery.trim()
        ? `User asked: "${textQuery}". Text found in image: "${extractedText}". Answer based on both.`
        : `Please explain or summarize this text extracted from an image: "${extractedText}"`;
      await sendMessageToAI(combinedQ);
      hideTyping();
      return;
    }
  } catch (ocrErr) {
    console.warn('[sendImageToAI] OCR failed:', ocrErr.message);
  }

  // ── FALLBACK 2: /analyze  (DeepAI + Tavily pipeline) ────────────
  try {
    const fd2 = new FormData();
    fd2.append('image', imageFile);
    if (textQuery && textQuery.trim()) fd2.append('query', textQuery.trim());
    const res2 = await fetch(`${API}/analyze`, { method: 'POST', body: fd2 });
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2.success && data2.answer) {
        hideTyping();
        let answer = data2.answer;
        if (lang === 'hi' && !/[\u0900-\u097F]/.test(answer))
          answer = await translateText(answer, 'hi');
        addMessage('ai', `🔍 ${data2.detected ? data2.detected + '\n\n' : ''}${answer}`);
        saveMessage('ai', answer);
        return;
      }
    }
  } catch (analyzeErr) {
    console.warn('[sendImageToAI] /analyze failed:', analyzeErr.message);
  }

  // ── LAST RESORT: Honest, friendly error ──────────────────────────
  hideTyping();
  const errorMsg = lang === 'hi'
    ? '⚠️ Image analyze nahi ho payi abhi. Thoda baad try karo ya image phir se bhejo.'
    : '⚠️ Image processing failed. Please try again or send a clearer image.';
  addMessage('ai', errorMsg);
}

/* ═══════════════════════════════════════════════════════════════════════
   MESSAGES – with edit support (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function addMessage(role, text, saveToConversation) {
  if (saveToConversation === undefined) saveToConversation = true;
  const hero     = $('hero');
  const container = $('chatMessages');
  if (!container) return;
  if (hero && hero.style.display !== 'none') {
    hero.style.display = 'none';
    container.classList.add('show');
    container.style.display = 'flex';
  }
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  let avatarUrl = '';
  if (role === 'ai') {
    avatarUrl = 'LOGO.png';
  } else {
    const letter = (currentUser && currentUser.firstName) ? currentUser.firstName.charAt(0).toUpperCase() : 'U';
    avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(letter)}&background=10a37f&color=fff`;
  }

  const avatar = document.createElement('img');
  avatar.className = 'message-avatar';
  avatar.src = avatarUrl;
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  // AI messages get ChatGPT-style word-by-word typing; user messages render instantly
  if (role !== 'ai') {
    bubble.innerHTML = renderMarkdown(text);
  }

  if (role === 'user') {
    const editIcon = document.createElement('span');
    editIcon.className = 'edit-message-icon';
    editIcon.innerHTML = '✏️';
    editIcon.title = 'Edit message (double-click also works)';
    editIcon.style.cssText = 'margin-left: 8px; cursor: pointer; font-size: 12px; opacity: 0.6; transition: 0.2s;';
    editIcon.onmouseenter = () => editIcon.style.opacity = '1';
    editIcon.onmouseleave = () => editIcon.style.opacity = '0.6';
    editIcon.onclick = (e) => {
      e.stopPropagation();
      editUserMessage(row, bubble, text);
    };
    bubble.appendChild(editIcon);
    bubble.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      editUserMessage(row, bubble, text);
    });
  }

  if (role === 'ai') { row.appendChild(avatar); row.appendChild(bubble); }
  else               { row.appendChild(bubble); row.appendChild(avatar); }

  container.appendChild(row);
  scrollToBottom();

  // Start typing animation for AI messages
  if (role === 'ai') {
    typeAIMessage(bubble, text, () => {
      // After typing finishes, speak if needed
      if (shouldSpeakNextReply) {
        speakReply(text);
        shouldSpeakNextReply = false;
      }
    });
  } else if (role === 'ai' && shouldSpeakNextReply) {
    speakReply(text);
    shouldSpeakNextReply = false;
  }

  if (role === 'user' && shouldSpeakNextReply) { /* voice flag only for AI */ }

  if (saveToConversation && currentConversationId) {
    const conv = conversations.find(c => c.id === currentConversationId);
    if (conv) {
      conv.messages.push({ role, text });
      if (role === 'user' && conv.messages.filter(m=>m.role==='user').length === 1 && conv.title === 'New conversation') {
        conv.title = text.length > 32 ? text.substring(0, 32) + '…' : text;
      }
      saveConversationsToLocalStorage();
      renderConversationList();
    }
  }
}

async function editUserMessage(row, bubble, oldText) {
  const input = document.createElement('textarea');
  input.value = oldText;
  input.style.cssText = `
    width: 100%;
    background: rgba(0,0,0,0.05);
    border: 1px solid #10a37f;
    border-radius: 12px;
    padding: 8px 12px;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
  `;
  const originalContent = bubble.innerHTML;
  bubble.innerHTML = '';
  bubble.appendChild(input);
  input.focus();

  const saveEdit = async () => {
    const newText = input.value.trim();
    if (newText && newText !== oldText) {
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv) {
        const msgIndex = conv.messages.findIndex(m => m.role === 'user' && m.text === oldText);
        if (msgIndex !== -1) {
          conv.messages[msgIndex].text = newText;
          conv.messages = conv.messages.slice(0, msgIndex + 1);
          saveConversationsToLocalStorage();
          renderConversationList();
          loadConversationMessages();
          shouldSpeakNextReply = true;
          await sendMessageToAI(newText);
        } else {
          bubble.innerHTML = renderMarkdown(newText);
          if (conv && conv.messages[msgIndex]) conv.messages[msgIndex].text = newText;
          saveConversationsToLocalStorage();
        }
      } else {
        bubble.innerHTML = renderMarkdown(newText);
      }
    } else if (!newText) {
      showToast('Message cannot be empty', 1500);
      bubble.innerHTML = originalContent;
    } else {
      bubble.innerHTML = originalContent;
    }
  };

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
  });
}

function showTyping() { const t = $('typingIndicator'); if (t) { t.style.display = 'flex'; scrollToBottom(); } }
function hideTyping()  { const t = $('typingIndicator'); if (t) t.style.display = 'none'; }

/* ═══════════════════════════════════════════════════════════════════════
   SEND HANDLER
   FIX 1: Image shown in chat INSTANTLY before backend call
   FIX 2: Voice output ONLY fires when fromVoice === true
   FIX 3: Image routes to /image-chat, text routes to /ask
═══════════════════════════════════════════════════════════════════════ */
async function handleSend(fromVoice) {
  if (fromVoice === undefined) fromVoice = false;
  const ta = $('msgTextarea');
  if (!ta) return;
  const msg = ta.value.trim();
  const hasImages = attachedFiles.some(f => f.type.startsWith('image/'));
  const hasOther  = attachedFiles.some(f => !f.type.startsWith('image/'));
  if (hasOther) showToast('Only image files can be analyzed. Others ignored.', 3000);

  if (isEnhanceIntent(msg) && !hasImages && !attachedFiles.length) {
    if (msg) { shouldSpeakNextReply = fromVoice; addMessage('user', msg); }
    ta.value = ''; autoResizeTextarea();
    addMessage('ai', '📎 Please upload an image to enhance.');
    return;
  }
  if (isEnhanceIntent(msg) && hasImages) {
    const imageFile = attachedFiles.find(f => f.type.startsWith('image/'));
    if (msg) { shouldSpeakNextReply = fromVoice; addMessage('user', msg); }
    attachedFiles = []; renderAttachments();
    ta.value = ''; autoResizeTextarea();
    await handleImageEnhancement(imageFile);
    return;
  }

  if (hasImages) {
    const imageFile = attachedFiles.find(f => f.type.startsWith('image/'));

    // ── FIX 1: Show image in chat INSTANTLY (before backend) ──
    showImageInChat(imageFile, msg);

    // Clear state immediately so UI feels responsive
    const capturedMsg = msg;
    attachedFiles = []; renderAttachments();
    ta.value = ''; autoResizeTextarea();

    // Voice flag: do NOT speak image AI answers unless user used mic
    shouldSpeakNextReply = fromVoice;

    await sendImageToAI(imageFile, capturedMsg || '');
    return;
  }

  // Text-only path (unchanged)
  if (msg) {
    shouldSpeakNextReply = fromVoice;
    addMessage('user', msg);
  }
  if (attachedFiles.length) { attachedFiles = []; renderAttachments(); }
  ta.value = ''; autoResizeTextarea();
  if (msg) {
    if (isImagePrompt(msg)) {
      await handleImageGeneration(msg);
    } else {
      await sendMessageToAI(msg);
    }
  }
}

/**
 * showImageInChat(imageFile, caption)
 * Immediately renders the uploaded/captured image as a user bubble in the chat.
 * Does NOT wait for backend response — instant feedback.
 */
function showImageInChat(imageFile, caption) {
  const hero      = $('hero');
  const container = $('chatMessages');
  if (!container) return;
  if (hero && hero.style.display !== 'none') {
    hero.style.display = 'none';
    container.classList.add('show');
    container.style.display = 'flex';
  }

  const row = document.createElement('div');
  row.className = 'message-row user';

  const letter  = (currentUser && currentUser.firstName) ? currentUser.firstName.charAt(0).toUpperCase() : 'U';
  const avatar  = document.createElement('img');
  avatar.className = 'message-avatar';
  avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(letter)}&background=10a37f&color=fff`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-width:280px;';

  // Image preview
  const imgEl = document.createElement('img');
  imgEl.style.cssText = 'width:100%;max-width:260px;border-radius:12px;object-fit:cover;cursor:pointer;border:1px solid rgba(255,255,255,0.1);';
  imgEl.alt = imageFile.name;
  imgEl.title = 'Click to view full size';
  imgEl.onclick = () => {
    const win = window.open();
    if (win) { win.document.write(`<img src="${imgEl.src}" style="max-width:100%;">`); }
  };
  const reader = new FileReader();
  reader.onload = e => { imgEl.src = e.target.result; };
  reader.readAsDataURL(imageFile);
  bubble.appendChild(imgEl);

  // Caption text (if any)
  if (caption && caption.trim()) {
    const captionEl = document.createElement('span');
    captionEl.style.cssText = 'font-size:14px;color:var(--text-1,#f0f4ff);';
    captionEl.textContent = caption;
    bubble.appendChild(captionEl);
  }

  row.appendChild(bubble);
  row.appendChild(avatar);
  container.appendChild(row);
  scrollToBottom();

  // Save to conversation
  if (currentConversationId) {
    const conv = conversations.find(c => c.id === currentConversationId);
    if (conv) {
      const label = caption ? `🖼️ ${caption}` : '🖼️ [Image]';
      conv.messages.push({ role: 'user', text: label });
      if (conv.messages.filter(m => m.role === 'user').length === 1 && conv.title === 'New conversation') {
        conv.title = label;
      }
      saveConversationsToLocalStorage();
      renderConversationList();
    }
  }
}

function autoResizeTextarea() {
  const ta = $('msgTextarea');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  const sb = $('sendBtn');
  // Enable send if there's text OR if there are attached images
  if (sb) sb.disabled = ta.value.trim() === '' && attachedFiles.length === 0;
}

function renderAttachments() {
  const preview = $('attachmentPreview');
  if (!preview) return;
  preview.innerHTML = '';
  attachedFiles.forEach((file, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px 4px 4px;';

    if (file.type.startsWith('image/')) {
      // Show real image thumbnail instantly
      const thumb = document.createElement('img');
      thumb.style.cssText = 'width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;border:1px solid rgba(255,255,255,0.1);';
      thumb.alt = file.name;
      const reader = new FileReader();
      reader.onload = e => { thumb.src = e.target.result; };
      reader.readAsDataURL(file);
      chip.appendChild(thumb);
    } else {
      const icon = document.createElement('span');
      icon.textContent = '📄';
      icon.style.cssText = 'font-size:20px;flex-shrink:0;';
      chip.appendChild(icon);
    }

    const info = document.createElement('span');
    info.style.cssText = 'font-size:12px;color:var(--text-2,#8892a4);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    info.textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    chip.appendChild(info);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-attach';
    removeBtn.dataset.idx = idx;
    removeBtn.textContent = '✖';
    removeBtn.style.cssText = 'margin-left:4px;background:none;border:none;color:#8892a4;cursor:pointer;font-size:13px;padding:0;';
    chip.appendChild(removeBtn);

    preview.appendChild(chip);
  });
  document.querySelectorAll('.remove-attach').forEach(btn => {
    btn.addEventListener('click', () => {
      attachedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderAttachments();
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   VOICE RECORDING (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function initMic() {
  const micBtn    = $('micBtn');
  if (!micBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micBtn.addEventListener('click', () => showToast('Voice input not supported in this browser. Try Chrome.', 3000));
    return;
  }

  micBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  const stopBtn = $('voiceStopBtn');
  if (stopBtn) stopBtn.addEventListener('click', stopRecording);
}

function startRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  mediaRecognition = new SpeechRecognition();
  mediaRecognition.continuous     = false;
  mediaRecognition.interimResults = true;
  mediaRecognition.lang           = 'hi-IN';

  const voiceModal      = $('voiceModal');
  const voiceTranscript = $('voiceTranscript');
  const voiceLabel      = $('voiceLabel');
  const micBtn          = $('micBtn');

  if (voiceModal)      voiceModal.style.display  = 'flex';
  if (voiceLabel)      voiceLabel.innerText       = 'Listening… bolo 🎙️';
  if (voiceTranscript) voiceTranscript.innerText  = 'Start speaking';
  if (micBtn)          micBtn.classList.add('recording');

  isRecording = true;
  let finalTranscript = '';
  let interimTranscript = '';

  mediaRecognition.onresult = (event) => {
    finalTranscript   = '';
    interimTranscript = '';
    for (let i = 0; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t;
      else interimTranscript += t;
    }
    const display = (finalTranscript + interimTranscript).trim() || 'Listening…';
    if (voiceTranscript) voiceTranscript.innerText = display;
  };

  mediaRecognition.onerror = (e) => {
    isRecording = false;
    stopRecording();
    if (e.error === 'not-allowed' || e.error === 'permission-denied') {
      showToast('Microphone permission denied. Please allow mic access.', 3500);
    } else if (e.error === 'no-speech') {
      showToast('No speech detected. Please speak clearly.', 2500);
    } else if (e.error === 'network') {
      showToast('Network error. Check your internet connection.', 3000);
    } else {
      showToast('Voice error: ' + e.error, 2500);
    }
  };

  mediaRecognition.onend = () => {
    const text = (finalTranscript || interimTranscript).trim();
    stopRecording();

    if (text) {
      const ta = $('msgTextarea');
      if (ta) {
        ta.value = text;
        autoResizeTextarea();
        const sb = $('sendBtn');
        if (sb) handleSend(true);
      }
    } else {
      showToast('Kuch sun nahi aaya. Dobara try karo 🎙️', 2500);
    }
  };

  try {
    mediaRecognition.start();
  } catch (e) {
    showToast('Microphone start nahi ho raha. Dobara try karo.', 2500);
    stopRecording();
  }
}

function stopRecording() {
  isRecording = false;
  const voiceModal = $('voiceModal');
  const micBtn     = $('micBtn');
  if (voiceModal) voiceModal.style.display = 'none';
  if (micBtn) micBtn.classList.remove('recording');
  if (mediaRecognition) {
    try { mediaRecognition.stop(); } catch(e) {}
    mediaRecognition = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   CLEAR CHAT (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function openClearModal() {
  const overlay = $('confirmOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeClearModal() {
  const overlay = $('confirmOverlay');
  if (overlay) overlay.style.display = 'none';
}

function confirmClearChat() {
  closeClearModal();
  if (!currentConversationId) return;
  const conv = conversations.find(c => c.id === currentConversationId);
  if (conv) {
    conv.messages = [];
    conv.title = 'New conversation';
    saveConversationsToLocalStorage();
    renderConversationList();
    clearChatArea();
    showToast('Chat cleared 🗑️');
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   CONVERSATIONS (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function saveConversationsToLocalStorage() {
  const key = 'ranai_convs_' + (currentUser ? currentUser.email : 'guest');
  _lsSet(key, JSON.stringify(conversations));
  _lsSet(key + '_current', currentConversationId);
}

function loadConversationsFromLocalStorage() {
  const key   = 'ranai_convs_' + (currentUser ? currentUser.email : 'guest');
  const saved = _lsGet(key);
  if (saved) {
    try { conversations = JSON.parse(saved); } catch(e) { conversations = []; }
  } else {
    conversations = [];
  }
  const savedId = _lsGet(key + '_current');
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
  saveConversationsToLocalStorage();
  renderConversationList();
  clearChatArea();
}

function clearChatArea() {
  const msgs = $('chatMessages');
  const hero = $('hero');
  if (msgs) { msgs.innerHTML = ''; msgs.classList.remove('show'); msgs.style.display = 'none'; }
  if (hero) hero.style.display = 'flex';
  hideTyping();
}

function loadConversationMessages() {
  const conv = conversations.find(c => c.id === currentConversationId);
  if (!conv) return;
  const msgs = $('chatMessages');
  const hero = $('hero');
  if (msgs) { msgs.innerHTML = ''; msgs.classList.remove('show'); msgs.style.display = 'none'; }
  if (hero) hero.style.display = 'flex';
  conv.messages.forEach(msg => addMessage(msg.role, msg.text, false));
  if (conv.messages.length && msgs) {
    if (hero) hero.style.display = 'none';
    msgs.classList.add('show');
    msgs.style.display = 'flex';
    scrollToBottom();
  }
}

function deleteConversation(id) {
  conversations = conversations.filter(c => c.id !== id);
  if (currentConversationId === id) {
    if (conversations.length) currentConversationId = conversations[0].id;
    else { newConversation(); return; }
  }
  saveConversationsToLocalStorage();
  renderConversationList();
  loadConversationMessages();
  showToast('Conversation deleted');
}

function renderConversationList() {
  const convList = $('convList');
  const searchConv = $('searchConv');
  if (!convList) return;
  const term     = (searchConv && searchConv.value) ? searchConv.value.toLowerCase() : '';
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
  for (const label in groups) {
    const convs = groups[label];
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
  convList.innerHTML = html || '<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px;">No conversations yet</div>';
}

function initConversationEvents() {
  const convList = $('convList');
  if (!convList) return;
  convList.addEventListener('click', e => {
    const del  = e.target.closest('.conv-delete');
    if (del) { e.stopPropagation(); deleteConversation(del.dataset.id); return; }
    const item = e.target.closest('.conv-item');
    if (item && item.dataset.id !== currentConversationId) {
      currentConversationId = item.dataset.id;
      saveConversationsToLocalStorage();
      renderConversationList();
      loadConversationMessages();
      if (window.innerWidth <= 768) closeSidebarMobile();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   SIDEBAR (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function closeSidebarMobile() {
  const sidebar = $('sidebar');
  const overlay = $('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');
}

function initSidebar() {
  const sidebar  = $('sidebar');
  const btn      = $('sidebarToggle');
  const overlay  = $('sidebarOverlay');
  if (!sidebar || !btn) return;

  const isMobile = () => window.innerWidth <= 768;

  function initState() {
    if (!isMobile()) sidebar.classList.add('collapsed');
    else sidebar.classList.remove('mobile-open', 'collapsed');
  }

  function toggle() {
    if (isMobile()) {
      sidebar.classList.toggle('mobile-open');
      if (overlay) overlay.classList.toggle('active');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  }

  btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  if (overlay) overlay.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
  });
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      if (!sidebar.classList.contains('collapsed')) sidebar.classList.add('collapsed');
      sidebar.classList.remove('mobile-open');
      if (overlay) overlay.classList.remove('active');
    } else {
      initState();
    }
  });
  initState();
}

/* ═══════════════════════════════════════════════════════════════════════
   MODEL DROPDOWN (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function initModelDropdown() {
  const modelPill    = $('modelPill');
  const modelDropdown = $('modelDropdown');
  if (!modelPill || !modelDropdown) return;

  modelPill.addEventListener('click', e => {
    e.stopPropagation();
    const rect = modelPill.getBoundingClientRect();
    modelDropdown.style.top  = (rect.bottom + 8) + 'px';
    modelDropdown.style.left = rect.left + 'px';
    modelDropdown.classList.toggle('open');
  });

  document.querySelectorAll('.model-option').forEach(opt => {
    opt.addEventListener('click', () => {
      currentModel = opt.dataset.model;
      const pillSpan = modelPill.querySelector('span:not(.model-dot)');
      if (pillSpan) pillSpan.innerText = currentModel;
      const dot = modelPill.querySelector('.model-dot');
      if (dot) dot.style.background = opt.querySelector('.model-color-dot') ? opt.querySelector('.model-color-dot').style.background : '#10a37f';
      document.querySelectorAll('.model-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      modelDropdown.classList.remove('open');
      showToast(`Switched to ${currentModel}`);
    });
  });

  document.addEventListener('click', e => {
    if (!modelDropdown.contains(e.target) && !modelPill.contains(e.target))
      modelDropdown.classList.remove('open');
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   USER MENU (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function initUserMenu() {
  const userMenuBtn  = $('userMenuBtn');
  const userDropdown = $('userDropdown');
  const userRow      = $('userRow');
  const topbarAvatar = $('topbarAvatar');
  if (!userDropdown) return;

  function openUserDropdown(near) {
    if (!near) return;
    const rect = near.getBoundingClientRect();
    userDropdown.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    userDropdown.style.left   = rect.left + 'px';
    userDropdown.style.top    = 'auto';
    userDropdown.classList.toggle('open');
  }

  if (userMenuBtn) userMenuBtn.addEventListener('click', e => { e.stopPropagation(); openUserDropdown(userRow); });
  if (topbarAvatar) topbarAvatar.addEventListener('click', e => { e.stopPropagation(); openUserDropdown(topbarAvatar); });
  document.addEventListener('click', e => { if (!userDropdown.contains(e.target)) userDropdown.classList.remove('open'); });

  $('settingsMenuItem') && $('settingsMenuItem').addEventListener('click', () => { userDropdown.classList.remove('open'); showToast('Settings coming soon!'); });
  $('upgradeMenuItem')  && $('upgradeMenuItem').addEventListener('click',  () => { userDropdown.classList.remove('open'); showToast('Upgrade plans coming soon! ⭐'); });
  $('upgradeBtn')       && $('upgradeBtn').addEventListener('click', () => showToast('Upgrade plans coming soon! ⭐'));
  $('profileMenuItem')  && $('profileMenuItem').addEventListener('click', () => { userDropdown.classList.remove('open'); showToast('Profile page coming soon!'); });

  $('logoutMenuItem') && $('logoutMenuItem').addEventListener('click', () => {
    userDropdown.classList.remove('open');
    logout();
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ATTACHMENTS — Extended with Camera + Upload popup
   Click 📎 → small popup appears: [📁 Upload File] [📷 Open Camera] [✕ Cancel]
   Camera opens ONLY on click — never auto-starts
═══════════════════════════════════════════════════════════════════════ */

let _cameraStream = null;

/** Stop camera stream and remove the camera modal */
function _closeCameraModal() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
  const m = $('ranaiCamModal');
  if (m) m.remove();
}

/** Open camera capture modal — only called on explicit button click */
async function _openCameraModal() {
  if ($('ranaiCamModal')) return; // already open

  const modal = document.createElement('div');
  modal.id = 'ranaiCamModal';
  modal.style.cssText = `position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.88);
    display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);`;

  modal.innerHTML = `
    <div style="background:rgba(14,16,22,0.98);border:1px solid rgba(255,255,255,0.1);
      border-radius:20px;overflow:hidden;width:min(460px,95vw);
      box-shadow:0 30px 80px rgba(0,0,0,0.8);">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:15px;font-weight:700;color:#f0f4ff;">📷 Camera</span>
        <button id="ranaiCamClose" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.09);
          color:#8892a4;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:15px;line-height:1;">✕</button>
      </div>
      <!-- Video -->
      <div style="position:relative;background:#000;aspect-ratio:4/3;width:100%;max-height:55vh;overflow:hidden;">
        <video id="ranaiCamVideo" autoplay playsinline muted
          style="width:100%;height:100%;object-fit:cover;display:block;"></video>
        <div id="ranaiCamLoader" style="position:absolute;inset:0;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:8px;color:#8892a4;font-size:13px;pointer-events:none;">
          <div style="font-size:36px;">📷</div><div>Starting camera…</div>
        </div>
        <canvas id="ranaiCamCanvas" style="display:none;"></canvas>
      </div>
      <!-- Actions -->
      <div style="padding:16px 18px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
        <button id="ranaiCamFlip" style="padding:10px 18px;border-radius:12px;
          background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
          color:#f0f4ff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">🔄 Flip</button>
        <button id="ranaiCamCapture" style="padding:10px 30px;border-radius:12px;
          background:linear-gradient(135deg,#10a37f,#0d8f6f);border:none;
          color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;
          box-shadow:0 4px 18px rgba(16,163,127,0.35);">📸 Capture</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Close handlers
  $('ranaiCamClose').onclick = _closeCameraModal;
  modal.addEventListener('click', e => { if (e.target === modal) _closeCameraModal(); });

  // Start camera
  let facingMode = 'user';
  const video  = $('ranaiCamVideo');
  const loader = $('ranaiCamLoader');

  async function startStream(facing) {
    if (_cameraStream) _cameraStream.getTracks().forEach(t => t.stop());
    try {
      _cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = _cameraStream;
      video.onloadedmetadata = () => { if (loader) loader.style.display = 'none'; };
    } catch (err) {
      if (loader) loader.innerHTML = `<div style="text-align:center;color:#ff6b6b;font-size:13px;">
        <div style="font-size:30px;margin-bottom:8px;">🚫</div>
        Camera access denied.<br><span style="color:#8892a4;font-size:11px;">Allow camera in browser settings and retry.</span></div>`;
      console.warn('[Camera]', err.message);
    }
  }
  await startStream(facingMode);

  $('ranaiCamFlip').onclick = async () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    if (loader) loader.style.display = 'flex';
    await startStream(facingMode);
  };

  $('ranaiCamCapture').onclick = () => {
    const canvas = $('ranaiCamCanvas');
    if (!canvas || !video || !video.videoWidth) {
      showToast('Camera not ready yet. Wait a moment.', 1800);
      return;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) { showToast('Capture failed. Try again.', 1800); return; }
      const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      attachedFiles.push(file);
      renderAttachments();
      // Enable send button since we now have a file
      const sb = $('sendBtn');
      if (sb) sb.disabled = false;
      _closeCameraModal();
      showToast('📷 Photo captured! Add a question or send.', 2200);
    }, 'image/jpeg', 0.92);
  };
}

/** Show the attach popup menu near the 📎 button */
function _showAttachPopup(attachBtn, fileInput) {
  // Toggle off if already open
  const existing = $('ranaiAttachPopup');
  if (existing) { existing.remove(); return; }

  const popup = document.createElement('div');
  popup.id = 'ranaiAttachPopup';

  const r = attachBtn.getBoundingClientRect();
  popup.style.cssText = `
    position:fixed;
    bottom:${window.innerHeight - r.top + 10}px;
    left:${Math.max(8, r.left - 10)}px;
    z-index:9990;
    background:rgba(16,18,26,0.97);
    border:1px solid rgba(255,255,255,0.11);
    border-radius:14px;padding:6px;
    box-shadow:0 14px 44px rgba(0,0,0,0.65);
    backdrop-filter:blur(18px);
    min-width:180px;
    animation:_ranaiPop 0.14s ease;`;

  popup.innerHTML = `
    <style>
      @keyframes _ranaiPop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      ._rpbtn{width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;
        border-radius:10px;border:none;background:transparent;color:#f0f4ff;
        font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit;text-align:left;transition:background 0.15s;}
      ._rpbtn:hover{background:rgba(255,255,255,0.08);}
      ._rpdiv{height:1px;background:rgba(255,255,255,0.07);margin:4px 2px;}
    </style>
    <button class="_rpbtn" id="_rpUpload"><span style="font-size:17px;">📁</span> Upload File</button>
    <button class="_rpbtn" id="_rpCamera"><span style="font-size:17px;">📷</span> Open Camera</button>
    <div class="_rpdiv"></div>
    <button class="_rpbtn" id="_rpCancel" style="color:#8892a4;"><span style="font-size:15px;">✕</span> Cancel</button>`;

  document.body.appendChild(popup);

  const close = () => { const p = $('ranaiAttachPopup'); if (p) p.remove(); };
  $('_rpUpload').onclick = () => { close(); fileInput.click(); };
  $('_rpCamera').onclick = () => { close(); _openCameraModal(); };
  $('_rpCancel').onclick = close;

  // Close on click outside
  setTimeout(() => {
    const handler = e => {
      if (!$('ranaiAttachPopup')?.contains(e.target) && e.target !== attachBtn) {
        close();
        document.removeEventListener('click', handler, true);
      }
    };
    document.addEventListener('click', handler, true);
  }, 15);
}

function initAttachments() {
  const attachBtn = $('attachBtn');
  if (!attachBtn) return;

  // Hidden file input (same as before)
  const fileInput = document.createElement('input');
  fileInput.type     = 'file';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  fileInput.accept   = 'image/jpeg,image/jpg,image/png';
  document.body.appendChild(fileInput);

  // Show popup instead of directly opening file picker
  attachBtn.addEventListener('click', e => {
    e.stopPropagation();
    _showAttachPopup(attachBtn, fileInput);
  });

  fileInput.addEventListener('change', e => {
    attachedFiles.push(...Array.from(e.target.files));
    renderAttachments();
    // Enable send button when files are added
    const sb = $('sendBtn');
    if (sb) sb.disabled = false;
    fileInput.value = '';
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   TOOL BUTTONS – added Stop Voice button (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function initToolBtns() {
  const webSearchBtn = $('webSearchBtn');
  const reasonBtn    = $('reasonBtn');
  const shareChatBtn = $('shareChatBtn');

  if (webSearchBtn) webSearchBtn.addEventListener('click', function() {
    this.classList.toggle('active');
    showToast(this.classList.contains('active') ? 'Web search enabled' : 'Web search disabled');
  });
  if (reasonBtn) reasonBtn.addEventListener('click', function() {
    this.classList.toggle('active');
    showToast(this.classList.contains('active') ? 'Reasoning mode on' : 'Reasoning mode off');
  });
  if (shareChatBtn) shareChatBtn.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).then(() => showToast('Link copied! 🔗'));
    } else showToast('Share coming soon!');
  });

  const clearChatBtn = $('clearChatBtn');
  if (clearChatBtn) clearChatBtn.addEventListener('click', openClearModal);

  let stopVoiceBtn = $('stopVoiceBtn');
  if (!stopVoiceBtn) {
    const micBtn = $('micBtn');
    if (micBtn && micBtn.parentNode) {
      stopVoiceBtn = document.createElement('button');
      stopVoiceBtn.id = 'stopVoiceBtn';
      stopVoiceBtn.className = 'tool-btn';
      stopVoiceBtn.innerHTML = '⏹️';
      stopVoiceBtn.title = 'Stop voice output';
      stopVoiceBtn.style.marginLeft = '8px';
      stopVoiceBtn.addEventListener('click', stopVoice);
      micBtn.parentNode.insertBefore(stopVoiceBtn, micBtn.nextSibling);
    }
  } else {
    stopVoiceBtn.addEventListener('click', stopVoice);
  }

  initMic();
}

/* ═══════════════════════════════════════════════════════════════════════
   EVENT LISTENERS (unchanged)
═══════════════════════════════════════════════════════════════════════ */
function initEventListeners() {
  const sendBtn    = $('sendBtn');
  const ta         = $('msgTextarea');
  const searchConv = $('searchConv');
  const newChatBtn = $('newChatBtn');

  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (ta) {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const sb = $('sendBtn');
        if (sb && !sb.disabled) handleSend();
      }
    });
    ta.addEventListener('input', autoResizeTextarea);
  }
  if (searchConv) searchConv.addEventListener('input', renderConversationList);
  if (newChatBtn) newChatBtn.addEventListener('click', () => newConversation());
}

/* ═══════════════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════════════ */
window.onload = function() {
  if (checkSavedSession()) {
    const authScreen = $('authScreen');
    if (authScreen) authScreen.style.display = 'none';
    const main = $('main');
    if (main) main.style.display = 'flex';

    updateUserUI();
    loadConversationsFromLocalStorage();
    initSidebar();
    initModelDropdown();
    initUserMenu();
    initAttachments();
    initToolBtns();
    initEventListeners();
    initConversationEvents();
  } else {
    const authScreen = $('authScreen');
    if (authScreen) authScreen.style.display = 'flex';
    const main = $('main');
    if (main) main.style.display = 'none';

    document.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const loginForm  = $('loginForm');
        const signupForm = $('signupForm');
        if (loginForm  && loginForm.style.display  !== 'none') handleLogin();
        else if (signupForm && signupForm.style.display !== 'none') handleSignup();
      }
    });
  }
};
/* ═══════════════════════════════════════════════════════════════════════
   JOB FINDER — Real jobs with Apply links
   3-layer: Server (Adzuna real) → Gemini direct → Static fallback
═══════════════════════════════════════════════════════════════════════ */
(function jobFinder() {
  const GEMINI_KEY = "AIzaSyA8t4ehEcTCz14tuI6DLSznGNRvWqzKj7Y";
  let jfLang = 'en';

  function gel(id) { return document.getElementById(id); }
  function jfEsc(s) { return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function show(id,flex){ const e=gel(id); if(e) e.style.display=flex?'flex':'block'; }
  function hide(id)     { const e=gel(id); if(e) e.style.display='none'; }

  function openModal() {
    const ov=gel('jfOverlay'); if(!ov) return;
    ov.style.display='flex';
    setTimeout(()=>{ gel('jfRole')?.focus(); },80);
  }
  function closeModal() { const ov=gel('jfOverlay'); if(ov) ov.style.display='none'; }
  function goBack() { hide('jfResults'); show('jfFormWrap'); const e=gel('jfErr'); if(e) e.textContent=''; }
  function setLang(lang) {
    jfLang=lang;
    gel('jfLangEn')?.classList.toggle('active-lang', lang==='en');
    gel('jfLangHi')?.classList.toggle('active-lang', lang==='hi');
  }

  function wireButtons() {
    gel('jobFinderBtn')?.addEventListener('click', openModal);
    gel('jfCloseBtn')?.addEventListener('click', closeModal);
    gel('jfBackBtn')?.addEventListener('click', goBack);
    gel('jfLangEn')?.addEventListener('click', ()=>setLang('en'));
    gel('jfLangHi')?.addEventListener('click', ()=>setLang('hi'));
    gel('jfFindBtn')?.addEventListener('click', doSearch);
    gel('jfOverlay')?.addEventListener('click', function(e){ if(e.target===this) closeModal(); });
    ['jfRole','jfLoc','jfSkills','jfExp'].forEach(id=>{
      gel(id)?.addEventListener('keydown', e=>{ if(e.key==='Enter') doSearch(); });
    });
    document.addEventListener('keydown', e=>{
      if(e.key==='Escape' && gel('jfOverlay')?.style.display!=='none') closeModal();
    });
  }

  async function doSearch() {
    const role   = (gel('jfRole')?.value||'').trim();
    const loc    = (gel('jfLoc')?.value||'').trim()||'Delhi';
    const skRaw  = (gel('jfSkills')?.value||'').trim();
    const expRaw = (gel('jfExp')?.value||'0').trim();
    const errEl  = gel('jfErr');
    const btn    = gel('jfFindBtn');

    if(!role){ if(errEl) errEl.textContent='Please enter a job role ⚠️'; gel('jfRole')?.focus(); return; }
    if(errEl) errEl.textContent='';

    const skills = skRaw ? skRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];
    const exp    = parseInt(expRaw,10)||0;

    // Show loading
    if(btn){ btn.disabled=true; btn.style.opacity='.6'; }
    hide('jfFormWrap'); hide('jfResults');
    show('jfLoading', true);

    let data = null;

    // ── Layer 1: Server /jobs (Adzuna real jobs) ──
    try {
      const serverBase = (typeof API!=='undefined' ? API : 'https://ran-ai.onrender.com');
      const res = await Promise.race([
        fetch(serverBase+'/jobs',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({role,location:loc,skills,experience:exp,lang:jfLang})
        }),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),10000))
      ]);
      if(res.ok){
        const j=await res.json();
        if(j&&j.success&&j.jobs&&j.jobs.length) data=j;
      }
    } catch(e){ console.warn('[JF] server:',e.message); }

    // ── Layer 2: Gemini direct ──
    if(!data){
      try {
        const isHi=jfLang==='hi';
        const sal=exp===0?'₹10,000–₹25,000':exp<=2?'₹20,000–₹50,000':exp<=5?'₹40,000–₹90,000':'₹80,000–₹2,00,000';
        const locSlug=loc.toLowerCase().replace(/\s+/g,'-');
        const prompt=`You are a job finder for India. Return ONLY raw JSON (no markdown, no backticks).
Role: ${role} | Location: ${loc} | Skills: ${skills.join(',')||'any'} | Exp: ${exp}yrs | Lang: ${jfLang}
Salary range: ${sal}/month. Generate 6 realistic job listings with real company names.
For apply_url use real portals: naukri.com, linkedin.com/jobs, indeed.co.in, internshala.com (for freshers).
Return: {"message":"...","jobs":[{"title":"","company":"","location":"${loc}","salary":"₹X – ₹Y/month","skills_required":[],"experience_required":"","type":"real","apply_url":"https://www.naukri.com/jobs-in-${locSlug}?q=${encodeURIComponent(role)}","description":"one line job desc","posted":"Today"}],"suggestions":["","",""]}`;

        const gr=await Promise.race([
          fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,{
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.7,maxOutputTokens:1800}})
          }),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),12000))
        ]);
        if(gr.ok){
          const gj=await gr.json();
          let raw=(gj?.candidates?.[0]?.content?.parts?.[0]?.text||'').trim()
            .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```\s*$/i,'').trim();
          const p=JSON.parse(raw);
          if(p&&p.jobs&&p.jobs.length) data={success:true,...p,realCount:0};
        }
      } catch(e){ console.warn('[JF] gemini:',e.message); }
    }

    // ── Layer 3: Smart static fallback with real portal links ──
    if(!data){
      const isHi=jfLang==='hi';
      const sal=exp===0?'₹10,000 – ₹22,000':exp<=2?'₹20,000 – ₹45,000':exp<=5?'₹45,000 – ₹85,000':'₹80,000 – ₹1,50,000';
      const sk=skills.length?skills:['Communication','Teamwork'];
      const q=encodeURIComponent(role);
      const locQ=encodeURIComponent(loc);
      data={success:true,realCount:0,
        message:isHi?`${role} ke liye ${loc} mein jobs dekho!`:`Check ${role} jobs near ${loc}!`,
        jobs:[
          {title:role,company:'TCS',location:loc,salary:sal,skills_required:sk,experience_required:exp===0?'Fresher':''+exp+'+ years',type:'real',apply_url:`https://www.naukri.com/${role.toLowerCase().replace(/\s+/g,'-')}-jobs-in-${loc.toLowerCase().replace(/\s+/g,'-')}`,description:'Apply via Naukri.com — one of India\'s top job portals'},
          {title:role,company:'Infosys',location:loc,salary:sal,skills_required:sk,experience_required:exp===0?'Fresher':''+exp+'+ years',type:'real',apply_url:`https://www.linkedin.com/jobs/search/?keywords=${q}&location=${locQ}`,description:'Apply via LinkedIn Jobs'},
          {title:role,company:'Wipro',location:loc,salary:sal,skills_required:sk,experience_required:exp===0?'Fresher':''+exp+'+ years',type:'real',apply_url:`https://www.indeed.co.in/jobs?q=${q}&l=${locQ}`,description:'Apply via Indeed India'},
          {title:role,company:'HCL Technologies',location:loc,salary:sal,skills_required:sk,experience_required:exp===0?'Fresher':''+exp+'+ years',type:'real',apply_url:`https://www.shine.com/job-search/${role.toLowerCase().replace(/\s+/g,'-')}-jobs-in-${loc.toLowerCase().replace(/\s+/g,'-')}`,description:'Apply via Shine.com'},
          {title:`${role} (Freelance)`,company:'Internshala',location:'Remote / '+loc,salary:exp===0?'₹8,000 – ₹15,000':'Negotiable',skills_required:sk,experience_required:exp===0?'Fresher / Intern':'Any',type:'real',apply_url:`https://internshala.com/jobs/${role.toLowerCase().replace(/\s+/g,'-')}-jobs-in-${loc.toLowerCase().replace(/\s+/g,'+')}`,description:'Internships & fresher jobs on Internshala'},
        ],
        suggestions:isHi
          ?['AWS/Azure certificate se salary 30% badh sakti hai','DSA practice karo — product companies mein zaroori hai','LinkedIn profile update karo aur recruiter ko message karo']
          :['Getting AWS/Azure certified can boost salary by 30%','Practice DSA for product company interviews','Update LinkedIn & reach out to recruiters directly']
      };
    }

    hide('jfLoading');
    jfRender(data, {role, loc, exp});
    show('jfResults', true);
    if(btn){ btn.disabled=false; btn.style.opacity='1'; }
  }

  function jfRender(data, meta) {
    // Message
    const msgEl=gel('jfMsg');
    if(msgEl) msgEl.textContent=data.message||'';

    // Sub message
    const subEl=gel('jfSubMsg');
    if(subEl){
      const rc=data.realCount||0;
      const total=(data.jobs||[]).length;
      subEl.textContent=rc>0
        ? `${rc} real listing${rc>1?'s':''} found with apply links`
        : `${total} listings with apply links from top job portals`;
    }

    // Cards
    const cardsEl=gel('jfCards');
    if(cardsEl){
      cardsEl.innerHTML='';
      (data.jobs||[]).forEach((job,i)=>{
        const isReal=job.type==='real';
        const badge=isReal
          ?`<span style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 10px;border-radius:20px;background:rgba(0,232,135,0.12);color:#00e887;border:1px solid rgba(0,232,135,0.22);flex-shrink:0;display:inline-flex;align-items:center;gap:4px;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Real</span>`
          :`<span style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 10px;border-radius:20px;background:rgba(59,130,246,0.1);color:#3b82f6;border:1px solid rgba(59,130,246,0.2);flex-shrink:0;">~ AI Est.</span>`;

        const tags=(job.skills_required||[]).slice(0,5).map(s=>
          `<span style="font-size:11px;font-weight:600;color:#8892a4;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:3px 8px;">${jfEsc(s)}</span>`
        ).join('');

        // Apply button — real link or search link
        let applyHtml = '';
        if(job.apply_url){
          applyHtml=`<a href="${jfEsc(job.apply_url)}" target="_blank" rel="noopener" class="apply-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Apply Now
          </a>`;
        }

        // Also always add Naukri search link
        const naukriUrl=`https://www.naukri.com/${encodeURIComponent((job.title||meta.role).toLowerCase().replace(/\s+/g,'-'))}-jobs-in-${encodeURIComponent((job.location||meta.loc).toLowerCase().replace(/\s+/g,'-'))}`;
        const altApply=!job.apply_url||job.apply_url===naukriUrl?'':
          `<a href="${jfEsc(naukriUrl)}" target="_blank" rel="noopener" class="apply-btn-ghost">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Naukri
          </a>`;

        const div=document.createElement('div');
        div.className='jcard'+(isReal?' real-job':'');
        div.style.animationDelay=(i*0.055)+'s';
        div.innerHTML=`
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;">
            <div style="min-width:0;">
              <div style="font-size:15px;font-weight:700;color:#f0f4ff;margin-bottom:2px;">${jfEsc(job.title)}</div>
              <div style="font-size:12.5px;color:#8892a4;font-weight:500;">${jfEsc(job.company)}</div>
            </div>
            ${badge}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
            <span style="font-size:12px;color:#8892a4;display:flex;align-items:center;gap:4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${jfEsc(job.location||meta.loc)}
            </span>
            <span style="font-size:12px;color:#8892a4;display:flex;align-items:center;gap:4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${jfEsc(job.experience_required||'Any')}
            </span>
            ${job.posted?`<span style="font-size:12px;color:#424d5c;display:flex;align-items:center;gap:4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.4"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${jfEsc(job.posted)}</span>`:''}
          </div>
          <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(0,232,135,0.08);border:1px solid rgba(0,232,135,0.15);border-radius:8px;padding:5px 12px;font-size:13px;font-weight:700;color:#00e887;margin-bottom:${tags||applyHtml?'12px':'0'};">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            ${jfEsc(job.salary||'Negotiable')}
          </div>
          ${job.description?`<div style="font-size:12px;color:#424d5c;margin-bottom:12px;line-height:1.5;">${jfEsc(job.description)}</div>`:''}
          ${tags?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${tags}</div>`:''}
          ${applyHtml||altApply?`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">${applyHtml}${altApply}</div>`:''}
        `;
        cardsEl.appendChild(div);
      });
    }

    // Tips
    const tipsEl=gel('jfTips');
    if(tipsEl){
      const sugs=data.suggestions||[];
      if(sugs.length){
        tipsEl.style.display='block';
        tipsEl.innerHTML=`<div style="background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.14);border-radius:14px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#3b82f6;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Salary Booster Tips
          </div>
          ${sugs.map(s=>`<div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#8892a4;padding:5px 0;line-height:1.5;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="color:#3b82f6;font-weight:700;flex-shrink:0;margin-top:1px;">→</span>${jfEsc(s)}</div>`).join('')}
        </div>`;
      } else { tipsEl.style.display='none'; }
    }

    // Setup note if Adzuna not configured
    const noteEl=gel('jfSetupNote');
    if(noteEl){
      if(data.adzunaReady===false){
        noteEl.style.display='block';
        noteEl.innerHTML='⚡ <strong>To get 100% real live job listings:</strong> Add free Adzuna API keys in server.js — register at <a href="https://developer.adzuna.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">developer.adzuna.com</a> (free, takes 2 min). Apply links above go to real job portals.';
      } else {
        noteEl.style.display='none';
      }
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    wireButtons();
  }
})();
/* ═══════════════════════════════════════════════════════════════════════
   🏛️ SARKARI JOB FINDER — Real-time Government Jobs
   SSC / Railway / Banking / Police / Army / Teaching / State PSC
   3-layer: Server /sarkari-jobs (Tavily+Gemini) → Gemini direct → Static fallback
═══════════════════════════════════════════════════════════════════════ */
(function sarkariJobFinder() {
  const GEMINI_KEY = "AIzaSyA8t4ehEcTCz14tuI6DLSznGNRvWqzKj7Y";
  let sjLang = 'hi'; // default Hindi — sarkari jobs mainly Hindi-speaking users

  const CATEGORIES = [
    { id: 'all',     label: 'सभी Jobs',   icon: '🏛️' },
    { id: 'SSC',     label: 'SSC',        icon: '📋' },
    { id: 'Railway', label: 'Railway',    icon: '🚂' },
    { id: 'Banking', label: 'Banking',    icon: '🏦' },
    { id: 'Police',  label: 'Police',     icon: '👮' },
    { id: 'Army',    label: 'Army/Def',   icon: '⚔️' },
    { id: 'Teaching',label: 'Teaching',   icon: '👩‍🏫' },
    { id: 'State PSC', label: 'State PSC', icon: '🏢' },
  ];

  function gel(id) { return document.getElementById(id); }
  function sjEsc(s) { return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function openSJModal() {
    const ov = gel('sjOverlay');
    if (!ov) return;
    ov.style.display = 'flex';
    setTimeout(() => ov.querySelector('.sj-modal')?.classList.add('sj-modal--in'), 10);
  }

  function closeSJModal() {
    const ov = gel('sjOverlay');
    if (!ov) return;
    ov.querySelector('.sj-modal')?.classList.remove('sj-modal--in');
    setTimeout(() => { ov.style.display = 'none'; }, 260);
  }

  function setSJLang(lang) {
    sjLang = lang;
    gel('sjLangHi')?.classList.toggle('active-lang', lang === 'hi');
    gel('sjLangEn')?.classList.toggle('active-lang', lang === 'en');
  }

  let selectedCat = 'all';
  function selectCat(cat) {
    selectedCat = cat;
    document.querySelectorAll('.sj-cat-btn').forEach(btn => {
      btn.classList.toggle('sj-cat-active', btn.dataset.cat === cat);
    });
  }

  function buildCatButtons() {
    const wrap = gel('sjCatWrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    CATEGORIES.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'sj-cat-btn' + (c.id === 'all' ? ' sj-cat-active' : '');
      btn.dataset.cat = c.id;
      btn.innerHTML = `<span class="sj-cat-icon">${c.icon}</span><span>${c.label}</span>`;
      btn.addEventListener('click', () => selectCat(c.id));
      wrap.appendChild(btn);
    });
  }

  async function doSJSearch() {
    const qualEl  = gel('sjQual');
    const stateEl = gel('sjState');
    const btnEl   = gel('sjFindBtn');
    const errEl   = gel('sjErr');

    const qualification = (qualEl?.value || '').trim() || 'any';
    const state         = (stateEl?.value || '').trim() || 'all';

    if (errEl) errEl.textContent = '';
    if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '.6'; }

    const formWrap = gel('sjFormWrap');
    const loadWrap = gel('sjLoading');
    const resultWrap = gel('sjResults');

    if (formWrap) formWrap.style.display = 'none';
    if (resultWrap) resultWrap.style.display = 'none';
    if (loadWrap) loadWrap.style.display = 'flex';

    let data = null;

    // ── Layer 1: Server /sarkari-jobs (Tavily + Gemini/GPT) ──
    try {
      const serverBase = (typeof API !== 'undefined' ? API : 'https://ran-ai.onrender.com');
      const res = await Promise.race([
        fetch(serverBase + '/sarkari-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: selectedCat, state, qualification, lang: sjLang })
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
      ]);
      if (res.ok) {
        const j = await res.json();
        if (j && j.success && j.jobs && j.jobs.length) data = j;
      }
    } catch (e) { console.warn('[SJ] server layer failed:', e.message); }

    // ── Layer 2: Gemini direct fallback ──
    if (!data) {
      try {
        const isHi = sjLang === 'hi';
        const prompt = `You are a Sarkari Job finder for India 2025. Return ONLY raw JSON (no markdown, no backticks).
Category: ${selectedCat}, State: ${state}, Qualification: ${qualification}, Language: ${sjLang}
Return 7 current government job notifications.
Each job must have: title, department, category, state, vacancies, qualification, age_limit, salary (Pay Scale format), lastDate (upcoming May-Aug 2025), applyUrl (real government site), source, notification_status (Active or Coming Soon).
Use real portals: ssc.nic.in, rrbcdg.gov.in, ibps.in, upsc.gov.in, uppbpb.gov.in, ctet.nic.in, joinindianarmy.nic.in
Return: {"message":"...","total_found":7,"jobs":[...],"suggestions":["...","...","..."]}`;

        const gr = await Promise.race([
          fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 2000 } })
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 14000))
        ]);
        if (gr.ok) {
          const gj = await gr.json();
          let raw = (gj?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '').trim();
          const p = JSON.parse(raw);
          if (p && p.jobs && p.jobs.length) data = { success: true, source_data: 'ai', ...p };
        }
      } catch (e) { console.warn('[SJ] gemini direct failed:', e.message); }
    }

    // ── Layer 3: Static fallback ──
    if (!data) {
      const isHi = sjLang === 'hi';
      const allFallback = [
        { title:'SSC CGL 2025', department:'Staff Selection Commission', category:'SSC', state:'All India', vacancies:'17,727 Posts', qualification:'Graduate', age_limit:'18-32 years', salary:'₹25,500–₹1,51,100', lastDate:'31 May 2025', applyUrl:'https://ssc.nic.in', source:'ssc.nic.in', notification_status:'Active' },
        { title:'RRB NTPC 2025', department:'Railway Recruitment Board', category:'Railway', state:'All India', vacancies:'11,558 Posts', qualification:'Graduate / 12th Pass', age_limit:'18-33 years', salary:'₹19,900–₹92,300', lastDate:'15 June 2025', applyUrl:'https://www.rrbcdg.gov.in', source:'rrbcdg.gov.in', notification_status:'Active' },
        { title:'IBPS PO 2025', department:'Institute of Banking Personnel Selection', category:'Banking', state:'All India', vacancies:'4,455 Posts', qualification:'Graduate', age_limit:'20-30 years', salary:'₹52,000–₹85,000/month', lastDate:'20 June 2025', applyUrl:'https://www.ibps.in', source:'ibps.in', notification_status:'Active' },
        { title:'UP Police Constable 2025', department:'UP Police Recruitment Board', category:'Police', state:'Uttar Pradesh', vacancies:'60,244 Posts', qualification:'12th Pass', age_limit:'18-22 years', salary:'₹21,700–₹69,100', lastDate:'25 June 2025', applyUrl:'https://uppbpb.gov.in', source:'uppbpb.gov.in', notification_status:'Active' },
        { title:'UPSC Civil Services 2025', department:'Union Public Service Commission', category:'State PSC', state:'All India', vacancies:'1,056 Posts', qualification:'Graduate (Any Stream)', age_limit:'21-32 years', salary:'₹56,100–₹2,50,000', lastDate:'28 May 2025', applyUrl:'https://www.upsc.gov.in', source:'upsc.gov.in', notification_status:'Active' },
        { title:'CTET 2025', department:'CBSE', category:'Teaching', state:'All India', vacancies:'Open Eligibility Test', qualification:'D.Ed / B.Ed', age_limit:'No limit', salary:'₹35,400–₹1,12,400', lastDate:'10 June 2025', applyUrl:'https://ctet.nic.in', source:'ctet.nic.in', notification_status:'Coming Soon' },
        { title:'Indian Army Agniveer 2025', department:'Indian Army (Agnipath)', category:'Army', state:'All India', vacancies:'25,000+ Posts', qualification:'10th / 12th Pass', age_limit:'17.5-23 years', salary:'₹30,000–₹40,000/month', lastDate:'30 June 2025', applyUrl:'https://joinindianarmy.nic.in', source:'joinindianarmy.nic.in', notification_status:'Coming Soon' },
        { title:'SSC CHSL 2025', department:'Staff Selection Commission', category:'SSC', state:'All India', vacancies:'3,712 Posts', qualification:'12th Pass', age_limit:'18-27 years', salary:'₹19,900–₹81,100', lastDate:'07 June 2025', applyUrl:'https://ssc.nic.in', source:'ssc.nic.in', notification_status:'Active' },
      ];
      let filteredFallback = allFallback;
      if (selectedCat !== 'all') {
        const f = allFallback.filter(j => j.category.toLowerCase().includes(selectedCat.toLowerCase()));
        if (f.length >= 2) filteredFallback = f;
      }
      data = {
        success: true, source_data: 'fallback',
        message: isHi ? `${filteredFallback.length} सरकारी नौकरियाँ मिलीं! जल्दी अप्लाई करें 🇮🇳` : `Found ${filteredFallback.length} government job notifications! Apply before last date 🇮🇳`,
        total_found: filteredFallback.length,
        jobs: filteredFallback,
        suggestions: isHi
          ? ['📱 sarkariresult.com को bookmark करें — रोज़ नई notifications', '📝 GS और Reasoning की daily practice करें', '⏰ Last date से 10 दिन पहले apply करें — server slow होता है']
          : ['📱 Bookmark sarkariresult.com for daily notifications', '📝 Practice GS & Reasoning daily for SSC/Banking', '⏰ Apply 10 days before deadline — servers slow on last day']
      };
    }

    if (loadWrap) loadWrap.style.display = 'none';
    sjRender(data);
    if (resultWrap) resultWrap.style.display = 'block';
    if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
  }

  const CAT_COLORS = {
    'SSC':      { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.22)',  text: '#fbbf24' },
    'Railway':  { bg: 'rgba(59,130,246,0.08)',   border: 'rgba(59,130,246,0.22)',  text: '#3b82f6' },
    'Banking':  { bg: 'rgba(168,85,247,0.08)',   border: 'rgba(168,85,247,0.22)',  text: '#a855f7' },
    'Police':   { bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.22)',   text: '#ef4444' },
    'Army':     { bg: 'rgba(16,185,129,0.08)',   border: 'rgba(16,185,129,0.22)',  text: '#10b981' },
    'Teaching': { bg: 'rgba(236,72,153,0.08)',   border: 'rgba(236,72,153,0.22)',  text: '#ec4899' },
    'State PSC':{ bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)',  text: '#f59e0b' },
    'PSU':      { bg: 'rgba(99,102,241,0.08)',   border: 'rgba(99,102,241,0.22)',  text: '#6366f1' },
  };

  function sjRender(data) {
    const msgEl = gel('sjMsg');
    if (msgEl) msgEl.textContent = data.message || '';

    const subEl = gel('sjSubMsg');
    if (subEl) subEl.textContent = `${data.total_found || (data.jobs||[]).length} notifications found`;

    const cardsEl = gel('sjCards');
    if (!cardsEl) return;
    cardsEl.innerHTML = '';

    (data.jobs || []).forEach((job, i) => {
      const catKey = job.category || 'SSC';
      const cc = CAT_COLORS[catKey] || { bg: 'rgba(0,232,135,0.08)', border: 'rgba(0,232,135,0.22)', text: '#00e887' };
      const isActive = job.notification_status !== 'Coming Soon';

      const statusBadge = isActive
        ? `<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;background:rgba(0,232,135,0.12);color:#00e887;border:1px solid rgba(0,232,135,0.25);display:inline-flex;align-items:center;gap:4px;"><span style="width:5px;height:5px;border-radius:50%;background:#00e887;display:inline-block;animation:pulse 1.2s ease infinite;"></span>Active</span>`
        : `<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;background:rgba(251,191,36,0.1);color:#fbbf24;border:1px solid rgba(251,191,36,0.25);">⏳ Coming Soon</span>`;

      const catBadge = `<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:${cc.bg};color:${cc.text};border:1px solid ${cc.border};">${sjEsc(catKey)}</span>`;

      const div = document.createElement('div');
      div.className = 'sj-card';
      div.style.animationDelay = (i * 0.06) + 's';
      div.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <div style="min-width:0;flex:1;">
            <div style="font-size:15px;font-weight:700;color:#f0f4ff;margin-bottom:3px;line-height:1.3;">${sjEsc(job.title)}</div>
            <div style="font-size:12px;color:#8892a4;">${sjEsc(job.department)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
            ${statusBadge}
            ${catBadge}
          </div>
        </div>
        <div class="sj-info-grid">
          <div class="sj-info-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.5;flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${sjEsc(job.state || 'All India')}
          </div>
          <div class="sj-info-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.5;flex-shrink:0;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            ${sjEsc(job.vacancies)}
          </div>
          <div class="sj-info-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.5;flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Last: ${sjEsc(job.lastDate)}
          </div>
          <div class="sj-info-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.5;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Age: ${sjEsc(job.age_limit)}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;background:rgba(0,232,135,0.07);border:1px solid rgba(0,232,135,0.13);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:700;color:#00e887;margin:10px 0 12px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          ${sjEsc(job.salary)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
          <span style="font-size:11px;color:#8892a4;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:3px 9px;">🎓 ${sjEsc(job.qualification)}</span>
          <span style="font-size:11px;color:#8892a4;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:3px 9px;">🌐 ${sjEsc(job.source)}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <a href="${sjEsc(job.applyUrl)}" target="_blank" rel="noopener" class="sj-apply-btn${isActive ? '' : ' sj-apply-btn--dim'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Official Site
          </a>
          <a href="https://sarkariresult.com" target="_blank" rel="noopener" class="sj-apply-btn sj-apply-btn--ghost">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            SarkariResult
          </a>
        </div>
      `;
      cardsEl.appendChild(div);
    });

    // Tips/suggestions
    const tipsEl = gel('sjTips');
    if (tipsEl) {
      const sugs = data.suggestions || [];
      if (sugs.length) {
        tipsEl.style.display = 'block';
        tipsEl.innerHTML = `<div class="sj-tips-box">
          <div class="sj-tips-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Preparation Tips
          </div>
          ${sugs.map(s => `<div class="sj-tip-row"><span class="sj-tip-arrow">→</span>${sjEsc(s)}</div>`).join('')}
        </div>`;
      } else { tipsEl.style.display = 'none'; }
    }
  }

  function wireSJButtons() {
    // Main open button
    document.querySelectorAll('[data-open-sarkari], #sarkariJobsBtn').forEach(btn => {
      btn.addEventListener('click', openSJModal);
    });
    gel('sjCloseBtn')?.addEventListener('click', closeSJModal);
    gel('sjBackBtn')?.addEventListener('click', () => {
      const r = gel('sjResults'); const f = gel('sjFormWrap');
      if (r) r.style.display = 'none';
      if (f) f.style.display = 'block';
    });
    gel('sjLangHi')?.addEventListener('click', () => setSJLang('hi'));
    gel('sjLangEn')?.addEventListener('click', () => setSJLang('en'));
    gel('sjFindBtn')?.addEventListener('click', doSJSearch);
    gel('sjOverlay')?.addEventListener('click', function(e) { if (e.target === this) closeSJModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && gel('sjOverlay')?.style.display !== 'none') closeSJModal();
    });
    buildCatButtons();
    setSJLang('hi');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSJButtons);
  } else {
    wireSJButtons();
  }
})();
