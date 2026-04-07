'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   RanAI – with Login/Signup + Voice Recording + Clear Chat + Stop Voice + Edit Message
   No database – localStorage only
═══════════════════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

// Backend URL
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

/* ═══════════════════════════════════════════════════════════════════════
   PARTICLE BACKGROUND
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

function scrollToBottom() {
  const area = document.querySelector('.chat-scroll-area');
  if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – Tab switch
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

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – Validate email
═══════════════════════════════════════════════════════════════════════ */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – localStorage users
═══════════════════════════════════════════════════════════════════════ */
function getStoredUsers() {
  try { return JSON.parse(localStorage.getItem('ranai_users') || '{}'); } catch { return {}; }
}
function saveStoredUsers(users) {
  localStorage.setItem('ranai_users', JSON.stringify(users));
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – Handle Login
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

  // Login success
  loginSuccess(user);
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – Handle Signup
═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – Login success
═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – Check saved session
═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   AUTH – Logout
═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   UPDATE USER UI
═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   TIME & LANGUAGE
═══════════════════════════════════════════════════════════════════════ */
function getCurrentTimeInIndia() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5*3600000);
  let h = ist.getUTCHours(), m = ist.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return { hours: h % 12 || 12, minutes: String(m).padStart(2,'0'), ampm };
}

/* ═══════════════════════════════════════════════════════════════════════
   ENHANCED LANGUAGE DETECTION
═══════════════════════════════════════════════════════════════════════ */
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
   HUMAN-LIKE RESPONSES (multi-language, Hinglish-aware)
═══════════════════════════════════════════════════════════════════════ */
function getHumanResponse(userMsg, lang) {
  const lower   = userMsg.toLowerCase().trim();
  const normed  = normaliseHinglish(lower);

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
    const replies = {
      hi:  ["नमस्ते! 😊 मैं RanAi हूँ। कुछ पूछना है?", "हैलो यार! कैसे मदद करूँ? 😄", "अरे, आ गए! बोलो क्या चाहिए? 😊"],
      bn:  ["নমস্কার! 😊 আমি RanAi। কীভাবে সাহায্য করতে পারি?"],
      ta:  ["வணக்கம்! 😊 நான் RanAi. எப்படி உதவலாம்?"],
      en:  ["Hello! 👋 I'm RanAi. How can I help?", "Hey! 😊 Ask me anything!", "Yo! What's up? I'm here to help 😄"],
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

  if (/(what is your name|your name|tumhara naam|aapka naam|tera naam|naam kya|name kya)/i.test(normed)) {
    if (lang === 'hi') return "मेरा नाम **RanAi** है — आपका दोस्त और AI assistant! 😊";
    return "My name is **RanAi** — your smart AI friend! 😊";
  }

  if (/(who (made|created|built) you|tumko kisne banaya|kisne banaya|creator|developer)/i.test(normed)) {
    if (lang === 'hi') return "मुझे **R@njit** ने बनाया है! 👨‍💻 Proud moment hai yaar!";
    return "I was created by **R@njit**! 👨‍💻";
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
   RANAI SYSTEM PROMPT (voice‑friendly)
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

Examples:
User: kya kr rha h
Reply: bas kaam chal raha hai, tu bata kya kar raha hai

User: samajh nahi aaya
Reply: koi nahi, main simple tarike se samjhata hu

STYLE
- Talk like a real human
- Friendly and natural
- No robotic tone
- No unnecessary emojis
- No formatting

MEMORY
- Use previous messages context
- Keep conversation natural

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

// ----- Enhanced voice selection with normal speed (1x) -----
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

function speakReply(text) {
  if (!('speechSynthesis' in window) || !text) return;

  const spokenText = sanitizeSpeechText(text);
  if (!spokenText) return;

  const synth = window.speechSynthesis;
  const lang = detectLanguage(spokenText);

  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  utterance.rate = 1.0;   // Normal speed (1x)
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  const speakNow = () => {
    const voices = synth.getVoices();
    const chosenVoice = pickBestVoice(lang, voices);
    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    }
    synth.speak(utterance);
  };

  const voices = synth.getVoices();
  if (voices.length) {
    speakNow();
  } else {
    const onVoicesChanged = () => {
      synth.removeEventListener('voiceschanged', onVoicesChanged);
      speakNow();
    };
    synth.addEventListener('voiceschanged', onVoicesChanged);
  }
}

// ----- Stop / Skip Voice -----
function stopVoice() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    showToast('Voice stopped', 1500);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   SEND MESSAGE TO AI (enhanced multi‑language + memory, faster)
═══════════════════════════════════════════════════════════════════════ */
async function sendMessageToAI(question) {
  const lang   = detectLanguage(question);
  const normed = normaliseHinglish(question.toLowerCase().trim());

  // Casual patterns – handle locally with minimal delay
  const casualPattern = /kitna baj|time kya|baj raha|baj rhe|time batao|what time|kya kar rahe|kya kr rhe|what are you doing|^(hi|hello|hey|hlo|hii|namaste|salaam|salam|vanakkam)|how are you|kaise ho|kya haal|sab theek|thik ho|kaisa chal|thank|shukriya|dhanyawad|good morning|good night|subah|shubh ratri|what is your name|your name|tumhara naam|naam kya|who made you|kisne banaya|i love you|love you|main tumse pyar|bored|bore ho/i;

  showTyping();

  if (casualPattern.test(normed)) {
    await sleep(150);  // Reduced from 500ms to 150ms for faster response
    hideTyping();
    addMessage('ai', getHumanResponse(question, lang));
    return;
  }

  const conv = conversations.find(c => c.id === currentConversationId);
  const history = conv ? conv.messages.slice(-6) : []; // Last 6 messages for context
  const historyText = history.length > 1
    ? history.slice(0, -1).map(m => `${m.role === 'user' ? 'User' : 'RanAI'}: ${m.text}`).join('\n')
    : '';

  const langSuffix = lang === 'hi'
    ? '\n\nIMPORTANT: The user is speaking Hindi or Hinglish. Reply in natural spoken Hindi or Hinglish. Prefer Hindi when the user speaks Hindi. Use simple spoken words only.'
    : lang !== 'en'
    ? `\n\nIMPORTANT: Reply in the same language the user wrote in, detected language: ${lang}.`
    : '\n\nIMPORTANT: Reply in simple spoken English.';

  const fullSystemPrompt = RANAI_SYSTEM_PROMPT + langSuffix;
  const userContent = historyText
    ? `Previous context:\n${historyText}\n\nUser: ${question}`
    : question;

  // PRIMARY: Pollinations Text API with shorter timeout (3 seconds)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000); // 3s timeout
    const polRes = await fetch(
      `https://text.pollinations.ai/${encodeURIComponent(fullSystemPrompt + '\n\n' + userContent)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (polRes.ok) {
      const polAnswer = (await polRes.text()).trim();
      if (polAnswer && polAnswer.length > 5) {
        hideTyping();
        addMessage('ai', polAnswer);
        return;
      }
    }
  } catch (polErr) {
    console.warn('[Pollinations Text] failed or slow:', polErr.message);
  }

  // FALLBACK: backend API (fast)
  const modifiedQuestion = lang === 'hi' ? question + ' (कृपया हिंदी में उत्तर दें)' : question;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: modifiedQuestion, model: currentModel, lang }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    hideTyping();
    let answer = data.reply || 'Sorry, I encountered an error.';
    if (lang === 'hi' && !/[\u0900-\u097F]/.test(answer)) {
      answer = await translateText(answer, 'hi');
    }
    addMessage('ai', answer);
  } catch (e) {
    hideTyping();
    addMessage('ai', '🌐 Network issue, please try again.');
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
// POLLINATIONS IMAGE GENERATION
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

async function handleImageGeneration(prompt) {
  const bubble = addImageLoadingBubble();
  const encoded = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?nologo=true&width=768&height=512&seed=${Date.now()}`;

  try {
    await new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, 8000); // 8s timeout
      img.onload  = () => { clearTimeout(timer); resolve(); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
      img.src = imageUrl;
    });
    if (bubble) fillImageBubble(bubble, imageUrl, prompt);
  } catch (primaryErr) {
    console.warn('[Pollinations Image] failed:', primaryErr.message);
    if (bubble) bubble.innerHTML = '<span class="poll-error">❌ Image generation failed. Please try again.</span>';
    scrollToBottom();
  } finally {
    shouldSpeakNextReply = false;
  }
}

async function sendImageToAI(imageFile, textQuery) {
  showTyping();
  const formData = new FormData();
  formData.append('image', imageFile);
  if (textQuery && textQuery.trim()) formData.append('query', textQuery);
  try {
    const res = await fetch(`${API}/analyze`, { method: 'POST', body: formData });
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

/* ═══════════════════════════════════════════════════════════════════════
   MESSAGES – with edit support
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
  bubble.innerHTML = renderMarkdown(text);

  // Add edit icon for user messages
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
    
    // Double-click to edit
    bubble.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      editUserMessage(row, bubble, text);
    });
  }

  if (role === 'ai') { row.appendChild(avatar); row.appendChild(bubble); }
  else               { row.appendChild(bubble); row.appendChild(avatar); }

  container.appendChild(row);
  scrollToBottom();

  if (role === 'ai' && shouldSpeakNextReply) {
    speakReply(text);
    shouldSpeakNextReply = false;
  }

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
  // Create an input field to edit
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
      // Find the message in conversation and update it
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv) {
        const msgIndex = conv.messages.findIndex(m => m.role === 'user' && m.text === oldText);
        if (msgIndex !== -1) {
          conv.messages[msgIndex].text = newText;
          // Remove all subsequent messages (AI responses) because we'll resend
          conv.messages = conv.messages.slice(0, msgIndex + 1);
          saveConversationsToLocalStorage();
          renderConversationList();
          // Reload conversation to show updated messages
          loadConversationMessages();
          // Resend the edited message to AI
          shouldSpeakNextReply = true;
          await sendMessageToAI(newText);
        } else {
          // Fallback: just update bubble
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
═══════════════════════════════════════════════════════════════════════ */
async function handleSend(fromVoice) {
  if (fromVoice === undefined) fromVoice = false;
  const ta = $('msgTextarea');
  if (!ta) return;
  const msg = ta.value.trim();
  const hasImages = attachedFiles.some(f => f.type.startsWith('image/'));
  const hasOther  = attachedFiles.some(f => !f.type.startsWith('image/'));
  if (hasOther) showToast('Only image files can be analyzed. Others ignored.', 3000);
  if (msg) {
    shouldSpeakNextReply = fromVoice;
    addMessage('user', msg);
  }
  if (hasImages) {
    const imageFile = attachedFiles.find(f => f.type.startsWith('image/'));
    attachedFiles = []; renderAttachments();
    ta.value = ''; autoResizeTextarea();
    await sendImageToAI(imageFile, msg || '');
    return;
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

/* ═══════════════════════════════════════════════════════════════════════
   VOICE RECORDING (Real Web Speech API)
═══════════════════════════════════════════════════════════════════════ */
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
        // Auto-send immediately (no extra delay)
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
   CLEAR CHAT
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
   CONVERSATIONS
═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   SIDEBAR
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
   MODEL DROPDOWN
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
   USER MENU
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
   ATTACHMENTS
═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   TOOL BUTTONS – added Stop Voice button
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

  // Add Stop Voice button (if not already present)
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
   EVENT LISTENERS
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
