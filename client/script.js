'use strict';

/* ════════════════════════════════════════════════════
   RanAI – with Login/Signup + Voice Recording + Clear Chat
   No database – localStorage only
════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

// Backend URL
const API = "https://ran-ai.onrender.com";

// ── Global state ──────────────────────────────────────
let currentUser          = null;
let currentConversationId = null;
let conversations        = [];
let attachedFiles        = [];
let currentModel         = "RanAI 4o";
let mediaRecognition     = null;
let isRecording          = false;

/* ════════════════════════════
   PARTICLE BACKGROUND
════════════════════════════ */
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

function scrollToBottom() {
  const area = document.querySelector('.chat-scroll-area');
  if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ════════════════════════════
   AUTH – Tab switch
════════════════════════════ */
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

/* Password visibility toggle */
function togglePass(inputId, btn) {
  const inp = $(inputId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.title = show ? 'Hide' : 'Show';
  btn.style.opacity = show ? '1' : '0.5';
}

/* Password strength checker */
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

/* ════════════════════════════
   AUTH – Validate email
════════════════════════════ */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/* ════════════════════════════
   AUTH – localStorage users
════════════════════════════ */
function getStoredUsers() {
  try { return JSON.parse(localStorage.getItem('ranai_users') || '{}'); } catch { return {}; }
}
function saveStoredUsers(users) {
  localStorage.setItem('ranai_users', JSON.stringify(users));
}

/* ════════════════════════════
   AUTH – Handle Login
════════════════════════════ */
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

  // Login success
  loginSuccess(user);
}

/* ════════════════════════════
   AUTH – Handle Signup
════════════════════════════ */
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

  // Save new user
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

  // Auto-login
  loginSuccess(newUser);
}

/* ════════════════════════════
   AUTH – Login success
════════════════════════════ */
function loginSuccess(user) {
  currentUser = user;
  localStorage.setItem('ranai_session', JSON.stringify({ email: user.email }));

  // Hide auth screen, show main
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

/* ════════════════════════════
   AUTH – Check saved session
════════════════════════════ */
function checkSavedSession() {
  try {
    const session = JSON.parse(localStorage.getItem('ranai_session') || 'null');
    if (!session || !session.email) return false;
    const users = getStoredUsers();
    const user  = users[session.email];
    if (!user) return false;
    currentUser = user;
    return true;
  } catch { return false; }
}

/* ════════════════════════════
   AUTH – Logout
════════════════════════════ */
function logout() {
  localStorage.removeItem('ranai_session');
  currentUser = null;
  conversations = [];
  currentConversationId = null;

  // Hide main, show auth
  $('main').style.display = 'none';
  const auth = $('authScreen');
  auth.style.display   = 'flex';
  auth.style.opacity   = '0';
  auth.style.transition = 'opacity 0.3s';
  setTimeout(() => { auth.style.opacity = '1'; }, 10);

  // Reset forms
  $('loginEmail').value    = '';
  $('loginPassword').value = '';
  $('loginError').innerText = '';
  switchTab('login');
}

/* ════════════════════════════
   UPDATE USER UI
════════════════════════════ */
function updateUserUI() {
  if (!currentUser) return;
  const displayName = currentUser.name || currentUser.firstName || 'User';
  const email       = currentUser.email || '';
  // First name only for sidebar to save space
  const shortName   = currentUser.firstName || displayName;

  const sidebarName = $('sidebarUserName');
  if (sidebarName) sidebarName.innerText = shortName;

  const ddName  = $('userDdName');
  const ddEmail = $('userDdEmail');
  if (ddName)  ddName.innerText  = displayName;
  if (ddEmail) ddEmail.innerText = email;

  // Avatars — use first letter of first name
  const letter    = (currentUser.firstName || 'U').charAt(0).toUpperCase();
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(letter)}&background=10a37f&color=fff`;

  const sidebarAvatar = $('sidebarUserAvatar');
  if (sidebarAvatar) sidebarAvatar.src = avatarUrl;

  const topbarImg = $('topbarAvatarImg');
  if (topbarImg) topbarImg.src = avatarUrl;

  const ddAvatar = $('userDdAvatar');
  if (ddAvatar) ddAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=10a37f&color=fff&size=80`;
}

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
  } catch (e) {
    hideTyping();
    addMessage('ai', '🌐 Network error. Make sure the backend is running.');
  }
}

async function translateText(text, targetLang) {
  if (targetLang !== 'hi') return text;
  try {
    const res  = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|hi`);
    const data = await res.json();
    if (data && data.responseData && data.responseData.translatedText) return data.responseData.translatedText;
  } catch (e) {}
  return text;
}

async function sendImageToAI(imageFile, textQuery) {
  showTyping();
  const formData = new FormData();
  formData.append('image', imageFile);
  if (textQuery && textQuery.trim()) formData.append('query', textQuery);
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
  } catch (e) {
    hideTyping();
    addMessage('ai', '🌐 Could not reach the image analysis server.');
  }
}

/* ════════════════════════════
   MESSAGES
════════════════════════════ */
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
  bubble.innerHTML = renderMarkdown(text);

  if (role === 'ai') { row.appendChild(avatar); row.appendChild(bubble); }
  else               { row.appendChild(bubble); row.appendChild(avatar); }

  container.appendChild(row);
  scrollToBottom();

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

function showTyping() { const t = $('typingIndicator'); if (t) { t.style.display = 'flex'; scrollToBottom(); } }
function hideTyping()  { const t = $('typingIndicator'); if (t) t.style.display = 'none'; }

/* ════════════════════════════
   SEND HANDLER
════════════════════════════ */
async function handleSend() {
  const ta = $('msgTextarea');
  if (!ta) return;
  const msg = ta.value.trim();
  const hasImages = attachedFiles.some(f => f.type.startsWith('image/'));
  const hasOther  = attachedFiles.some(f => !f.type.startsWith('image/'));
  if (hasOther) showToast('Only image files can be analyzed. Others ignored.', 3000);
  if (msg) addMessage('user', msg);
  if (hasImages) {
    const imageFile = attachedFiles.find(f => f.type.startsWith('image/'));
    attachedFiles = []; renderAttachments();
    ta.value = ''; autoResizeTextarea();
    await sendImageToAI(imageFile, msg || '');
    return;
  }
  if (attachedFiles.length) { attachedFiles = []; renderAttachments(); }
  ta.value = ''; autoResizeTextarea();
  if (msg) await sendMessageToAI(msg);
}

function autoResizeTextarea() {
  const ta = $('msgTextarea');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  const sb = $('sendBtn');
  if (sb) sb.disabled = ta.value.trim() === '';
}

function renderAttachments() {
  const preview = $('attachmentPreview');
  if (!preview) return;
  preview.innerHTML = '';
  attachedFiles.forEach((file, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.innerHTML = `<span>${escapeHtml(file.name)} (${(file.size/1024).toFixed(1)} KB)</span><button class="remove-attach" data-idx="${idx}">✖</button>`;
    preview.appendChild(chip);
  });
  document.querySelectorAll('.remove-attach').forEach(btn => {
    btn.addEventListener('click', () => {
      attachedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderAttachments();
    });
  });
}

/* ════════════════════════════
   VOICE RECORDING (Real Web Speech API)
════════════════════════════ */
function initMic() {
  const micBtn    = $('micBtn');
  const voiceModal = $('voiceModal');
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
  mediaRecognition.continuous     = true;
  mediaRecognition.interimResults = true;
  mediaRecognition.lang           = 'hi-IN,en-IN,en-US'; // Hindi + English support

  const voiceModal     = $('voiceModal');
  const voiceTranscript = $('voiceTranscript');
  const voiceLabel     = $('voiceLabel');
  const micBtn         = $('micBtn');

  if (voiceModal) voiceModal.style.display = 'flex';
  if (voiceLabel) voiceLabel.innerText = 'Listening…';
  if (voiceTranscript) voiceTranscript.innerText = 'Start speaking';
  if (micBtn) micBtn.classList.add('recording');

  isRecording = true;
  let finalTranscript = '';

  mediaRecognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t;
      else interim += t;
    }
    if (voiceTranscript) voiceTranscript.innerText = finalTranscript + interim || 'Listening…';
  };

  mediaRecognition.onerror = (e) => {
    stopRecording();
    if (e.error === 'not-allowed') showToast('Microphone permission denied.', 3000);
    else showToast('Voice error: ' + e.error, 2500);
  };

  mediaRecognition.onend = () => {
    if (isRecording) {
      // Insert transcript into textarea
      const ta = $('msgTextarea');
      if (ta && finalTranscript.trim()) {
        ta.value = finalTranscript.trim();
        autoResizeTextarea();
      }
      stopRecording();
    }
  };

  try {
    mediaRecognition.start();
  } catch (e) {
    showToast('Could not start microphone.', 2500);
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

/* ════════════════════════════
   CLEAR CHAT
════════════════════════════ */
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

/* ════════════════════════════
   CONVERSATIONS
════════════════════════════ */
function saveConversationsToLocalStorage() {
  const key = 'ranai_convs_' + (currentUser ? currentUser.email : 'guest');
  localStorage.setItem(key, JSON.stringify(conversations));
  localStorage.setItem(key + '_current', currentConversationId);
}

function loadConversationsFromLocalStorage() {
  const key   = 'ranai_convs_' + (currentUser ? currentUser.email : 'guest');
  const saved = localStorage.getItem(key);
  if (saved) {
    try { conversations = JSON.parse(saved); } catch(e) { conversations = []; }
  } else {
    conversations = [];
  }
  const savedId = localStorage.getItem(key + '_current');
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

/* ════════════════════════════
   SIDEBAR
════════════════════════════ */
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

/* ════════════════════════════
   MODEL DROPDOWN
════════════════════════════ */
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

/* ════════════════════════════
   USER MENU
════════════════════════════ */
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

/* ════════════════════════════
   ATTACHMENTS
════════════════════════════ */
function initAttachments() {
  const attachBtn = $('attachBtn');
  if (!attachBtn) return;
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.multiple = true; fileInput.style.display = 'none';
  fileInput.accept = 'image/jpeg,image/jpg,image/png';
  document.body.appendChild(fileInput);
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    attachedFiles.push(...Array.from(e.target.files));
    renderAttachments();
    fileInput.value = '';
  });
}

/* ════════════════════════════
   TOOL BUTTONS
════════════════════════════ */
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

  // Clear chat button
  const clearChatBtn = $('clearChatBtn');
  if (clearChatBtn) clearChatBtn.addEventListener('click', openClearModal);

  // Mic
  initMic();
}

/* ════════════════════════════
   EVENT LISTENERS
════════════════════════════ */
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

/* ════════════════════════════
   INIT
════════════════════════════ */
window.onload = function() {
  // Check if user already logged in
  if (checkSavedSession()) {
    // Already logged in — skip auth screen
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
    // Show auth screen
    const authScreen = $('authScreen');
    if (authScreen) authScreen.style.display = 'flex';
    const main = $('main');
    if (main) main.style.display = 'none';

    // Allow Enter key on auth forms
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
