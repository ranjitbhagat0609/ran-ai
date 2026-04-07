const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const session = require("express-session"); // for conversation memory
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { tavily } = require("@tavily/core");

const app = express();
app.use(cors());
app.use(express.json());
// 🔥 RanAI Smart Data
const data = [
  { q: ["good morning", "gm", "gud mrng"], a: "Good morning 😊" },
  { q: ["bad mood", "mood off", "sad"], a: "Thoda rest lo, sab thik ho jayega." },
  { q: ["welcome", "wlcm"], a: "Thank you 😊" },
  { q: ["aaj barish hogi", "rain today"], a: "Kis location ka weather check karna hai?" },
  { q: ["iran war update"], a: "Kis date ka update chahiye?" }
];


// 🔥 Clean text
function cleanText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


// 🔥 Match score
function matchScore(input, questions) {
  let score = 0;

  for (let q of questions) {
    q = cleanText(q);

    if (input.includes(q)) {
      score += q.length;
    }
  }

  return score;
}


// 🔥 Find best answer
function findBestAnswer(userInput) {
  let input = cleanText(userInput);

  let bestScore = 0;
  let bestAnswer = "Samajh nahi aaya 😅 thoda aur clear bolo";

  for (let item of data) {
    let score = matchScore(input, item.q);

    if (score > bestScore) {
      bestScore = score;
      bestAnswer = item.a;
    }
  }

  return bestAnswer;
}
app.use(express.static(path.join(__dirname, "../client")));

// Session setup for human-like conversation memory
app.use(
  session({
    secret: "ranai-convo-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 60 * 1000 }, // 30 minutes
  })
);
app.post("/chat", (req, res) => {
  const userMsg = req.body.message;

  if (!userMsg) {
    return res.json({ bot: "Message bhejo 😅" });
  }

  const reply = findBestAnswer(userMsg);

  res.json({
    user: userMsg,
    bot: reply
  });
});
// ========== API KEYS ==========
const GEMINI_API_KEY = "AIzaSyA8t4ehEcTCz14tuI6DLSznGNRvWqzKj7Y";
const TAVILY_API_KEY = "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";
const DEEPSEEK_API_KEY = "d69c64d0-d7dd-4670-999b-3121add422d4";
const OPENAI_API_KEY = "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"; // 🔑 Apni OpenAI API key yahan daalo

// ========== AI SETUP ==========
let model = null;
try {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  console.log("✅ Gemini AI ready (vision + chat)");
} catch (err) {
  console.warn("⚠️ Gemini not available:", err.message);
}

const tvly = tavily({ apiKey: TAVILY_API_KEY });

// ========== MULTER ==========
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only .jpeg, .jpg, .png formats allowed"), false);
  },
});

// ========== LANGUAGE DETECTION (multi-script + Hinglish) ==========
function normaliseHinglish(text) {
  const map = [
    [/\bkha\b/g,'kahan'],[/\bkr\b/g,'kar'],[/\bkrna\b/g,'karna'],
    [/\bbt\b/g,'baat'],[/\bbtao\b/g,'batao'],[/\bh\b/g,'hai'],
    [/\bhn\b/g,'hain'],[/\brha\b/g,'raha'],[/\brhe\b/g,'rahe'],
    [/\bnhi\b/g,'nahi'],[/\bnai\b/g,'nahi'],[/\bhlo\b/g,'hello'],
    [/\bhii\b/g,'hi'],[/\bthx\b/g,'thanks'],[/\bplz\b/g,'please'],
    [/\bpls\b/g,'please'],[/\bkyu\b/g,'kyun'],[/\bsmjh\b/g,'samajh'],
  ];
  let t = text.toLowerCase();
  for (const [p,r] of map) t = t.replace(p,r);
  return t;
}

function detectLanguage(text) {
  const t = text.trim();
  if (/[\u0900-\u097F]/.test(t)) return "hi";  // Devanagari
  if (/[\u0980-\u09FF]/.test(t)) return "bn";  // Bengali
  if (/[\u0B80-\u0BFF]/.test(t)) return "ta";  // Tamil
  if (/[\u0C00-\u0C7F]/.test(t)) return "te";  // Telugu
  if (/[\u0A80-\u0AFF]/.test(t)) return "gu";  // Gujarati
  if (/[\u0A00-\u0A7F]/.test(t)) return "pa";  // Punjabi
  if (
    /\b(namaste|kaise|kya|haal|chal|thik|bahut|mujhe|aap|main|btao|shukriya|dhanyawad|nahi|nhi|kyun|kab|kahan|kha|kaun|mera|tera|hum|tum|bhai|dost|accha|theek|yaar|yar|bol|bolo|kar|karo|kr|krna|hai|hain|tha|thi|the|raha|rahe|ho|hoga|bilkul|zaroor|arrey|arre|abhi|phir|lekin|aur|matlab|samjha|smjh|lagta|lagti|chahiye|zyada|thoda|bohot|bahut|pata|baat|bt)\b/i.test(t)
  ) return "hi";
  return "en";
}

// ========== TENSE DETECTION ==========
function detectTense(question) {
  const q = question.toLowerCase();
  // Past indicators
  if (
    /\b(did|was|were|had|been|used to|yesterday|last night|ago|earlier|previously|already|before|once|in the past)\b/.test(
      q
    ) ||
    /\b(\w+ed)\b/.test(q) // simple past verbs
  )
    return "past";
  // Future indicators
  if (
    /\b(will|shall|going to|gonna|tomorrow|next|soon|later|in the future|upcoming)\b/.test(
      q
    )
  )
    return "future";
  // Present indicators
  return "present";
}

// ========== REAL-TIME INDIA INFO (FIXED) ==========
function getIndiaRealTime() {
  const now = new Date();
  const options = {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };
  const formatted = now.toLocaleString("en-IN", options);
  const timezone = "Indian Standard Time (IST), UTC+5:30";
  return { formatted, timezone };
}

// ========== ADVANCED MATH SOLVER ==========
function solveAdvancedMath(input) {
  let expr = input
    .replace(/what is|calculate|solve|evaluate|find|value of|the answer to|compute|result of/gi, "")
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b|\bmultiplied by\b/gi, "*")
    .replace(/\bdivided by\b/gi, "/")
    .replace(/\bmod\b/gi, "%")
    .replace(/\bto the power of\b|\bpow\b/gi, "**")
    .replace(/\^/g, "**")
    .replace(/\bsqrt\b/gi, "Math.sqrt")
    .replace(/\bsin\b/gi, "Math.sin")
    .replace(/\bcos\b/gi, "Math.cos")
    .replace(/\btan\b/gi, "Math.tan")
    .replace(/\blog\b/gi, "Math.log10")
    .replace(/\bln\b/gi, "Math.log")
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/\be\b(?!\w)/gi, "Math.E")
    .replace(/[,،]/g, "")
    .trim();

  // Allow only safe math expressions
  if (!/^[\d\s+\-*/().%**\[\]Math\.\w]+$/.test(expr)) return null;
  if (!/\d/.test(expr)) return null;

  try {
    const result = Function('"use strict"; return (' + expr + ")")();
    if (typeof result === "number" && isFinite(result)) {
      return parseFloat(result.toFixed(8));
    }
  } catch (_) {}
  return null;
}

function buildTable(num) {
  const rows = [];
  for (let i = 1; i <= 10; i++) rows.push(`${num} × ${i} = ${num * i}`);
  return `📊 **Table of ${num}**\n` + rows.join("\n");
}

// ========== LARGE CONVERSATIONAL DATASET (~1000 Q&A pairs) ==========
// Added without removing any existing code. This object is checked early in getLocalResponse.
const conversationalData = {
  // Greetings & basic hellos
  "kya kar raha hai": "Bas tumse baat kar raha hoon 😊",
"kya kr rha hai": "Bas chill kar raha hoon 😄",
"kya kr rha": "Tumse chat kar raha hoon 😊",
"what are you doing now": "Just talking to you 😊",
"wht r u doing": "Chatting with you 😄",

"tum free ho": "Haan 😊 main hamesha available hoon",
"are you free": "Yes 😊 I'm always here for you",
"free ho kya": "Bilkul 😄 bolo kya baat hai",

"mujhe baat karni hai": "Haan bolo 😊 main sun raha hoon",
"talk to me": "Sure 😊 I'm here to talk",
"baat kare": "Haan 😊 kya baat karni hai?",

"mood off hai": "Koi baat nahi 😊 sab theek ho jayega",
"mera mood kharab hai": "Relax 😊 thoda time do sab better hoga",
"i am sad": "I'm here for you 😊 kya hua?",
"feeling low": "Stay strong 💙 main yahi hoon",

"khush kaise rahe": "Positive socho aur apne aap ko busy rakho 😊",
"how to be happy": "Focus on good things and stay positive 😊",

"kya tum help karoge": "Haan bilkul 😊 batao kya help chahiye",
"will you help me": "Of course 😊 just tell me",
"help kro": "Haan 😄 kya problem hai",

"samajh nahi aata": "Main simple way me samjhata hoon 😊",
"samjh nhi aaya": "Koi baat nahi 😄 fir se explain karta hoon",
"didn't understand": "No problem 😊 let me explain again",

"tum fast ho": "Haan 😄 main fast hoon",
"you are fast": "Thanks 😊 I try to respond quickly",

"tum slow ho": "Oops 😅 try karta hoon fast hone ka",
"you are slow": "Sorry 😅 I'll be faster", "hello bhai": "Hello bhai 😄 kya haal hai?",
"hey bro": "Hey bro 😎 kya scene hai?",
"hlo bro": "Hello 😄 bolo kya help chahiye?",
"namaste bhai": "Namaste 🙏 kaise ho?",

"ka haal hai": "Sab badhiya 😄 tum batao?",
"kya scene hai": "Sab chill 😎 tum batao kya chal raha hai?",
"scene kya hai": "Kuch khaas nahi 😄",

"tum busy ho": "Nahi 😊 main free hoon",
"busy ho kya": "Nahi 😄 bolo kya kaam hai",
"are you busy": "No 😊 I'm available",

"sun na": "Haan bolo 😊",
"ek baat bolu": "Haan bolo 😄",
"sun": "Haan bhai 😎 kya hua",

"mujhe problem hai": "Batao 😊 main help karta hoon",
"problem ho gayi": "Kya hua? batao 😄",
"i have a problem": "Tell me 😊 I'll help",

"solution chahiye": "Bilkul 😊 kya problem hai?",
"solve karo": "Haan 😄 try karta hoon",

"kya tum samajhte ho": "Haan 😊 main samajhne ki koshish karta hoon",
"do you understand": "Yes 😊 I try to understand",

"mujhe doubt hai": "Pucho 😊 clear karte hain",
"doubt hai": "Batao 😄 kya doubt hai",

"kuch galat lag raha": "Check karte hain 😊",
"something is wrong": "Let me check 😊",

"tum smart ho kya": "Thoda sa 😄",
"are you smart": "I try my best 😄",

"tumse baat achi lagti hai": "Mujhe bhi 😊",
"i like talking to you": "Same here 😊",

"tum funny ho": "Thanks 😂",
"you are funny": "Glad you like it 😂",

"ek aur joke": "Ready ho 😂 suno...",
"one more joke": "Here it is 😂",

"tum serious ho": "Kabhi kabhi 😄",
"are you serious": "Depends 😄",

"majak kar raha hoon": "Haha 😄 samajh gaya",
"just kidding": "😂 nice one",

"tumko sab pata hai": "Sab nahi 😅 par try karta hoon",
"do you know everything": "Not everything 😅",

"tum google ho kya": "Nahi 😄 par similar hoon",
"are you google": "No 😄 but I help like it",

"tum offline ho jaoge": "Nahi 😊 main yahi hoon",
"will you go offline": "No 😊 I'm here",

"kab tak help karoge": "Jab tak tum chaho 😊",
"how long you help": "As long as you need 😊",

"tum thak gaye": "Nahi 😄 main AI hoon",
"are you tired now": "No 😄 never tired",

"mujhe hasi aa rahi": "😂 good good",
"i am laughing": "😂 that's great",

"serious baat hai": "Haan 😊 bolo",
"important baat": "Haan 😄 batao",

"jaldi bolo": "Haan 😄 sun raha hoon",
"quick answer": "Okay 😊 here's quick answer",

"slow mat ho": "Try kar raha hoon fast hone ka 😅",
"dont be slow": "I'll be faster 😄",

"tum help nahi kar rahe": "Sorry 😅 fir try karta hoon",
"you are not helping": "Sorry 😅 let me try again",

"samay kya hua": "India me abhi time check kar lo 😊",
"time batao": "Abhi ka time bata deta hoon 😊",

"tum kya ho": "Main AI assistant hoon 🤖",
"what are you": "I'm an AI assistant 🤖",

"tum kaise kaam karte ho": "Main data aur logic se kaam karta hoon 🤖",
"how you work": "I process data and respond 🤖",

"tum mujhe jante ho": "Abhi nahi 😄 par seekh sakta hoon",
"do you know me": "Not yet 😊 but I can learn",

"mujhe yaad rakhoge": "Haan 😊 agar system allow kare",
"will you remember me": "Yes 😊 if memory enabled",

"tum online ho": "Haan 🌐 main online hoon",
"are you online": "Yes 🌐 always online",

"network slow hai": "Check internet 😅",
"internet slow": "Try restarting connection 😄",

"error aa raha": "Kya error hai? batao 😊",
"getting error": "Tell me error 😊 I'll help",

"fix karo": "Haan 😄 batao issue kya hai",
"fix this": "Sure 😊 what's the issue",

"code nahi chal raha": "Error share karo 😊",
"code not working": "Show me code 😊",

"server down hai": "Restart karke dekho 😄",
"server not working": "Check logs 😊",

"login nahi ho raha": "Check credentials 😄",
"cant login": "Check email/password 😊",

"password galat hai": "Reset kar lo 😄",
"wrong password": "Try reset 😊",

"otp nahi aa raha": "Network check karo 😅",
"otp not received": "Wait or resend 😊",

"email nahi aa rahi": "Spam folder check karo 😄",
"email not coming": "Check spam 😊",

"app crash ho raha": "Update ya restart karo 😄",
"app crashing": "Try reinstall 😊",

"mobile hang ho raha": "Restart karo 📱",
"phone lagging": "Clear storage 📱",

"storage full hai": "Kuch delete karo 😄",
"storage full": "Free some space 📱",

"battery low hai": "Charge kar lo 🔋",
"low battery": "Plug charger 🔌",

"charging nahi ho raha": "Cable check karo 😄",
"not charging": "Try another cable 🔌",

"wifi nahi chal raha": "Router restart karo 📶",
"wifi not working": "Check connection 📶",

"data nahi chal raha": "Network check karo 📡",
"mobile data not working": "Turn on/off data 📡",

"signal nahi hai": "Location change karo 📡",
"no signal": "Move to better area 📡",

"call nahi lag raha": "Network issue ho sakta hai 📞",
"cant call": "Check network 📞",

"msg nahi ja raha": "Balance ya network check karo 📩",
"sms not sending": "Check network 📩",

"tum best ho bhai": "Thanks bhai 😄",
"you are awesome": "Thank you 😊",

"mast ho tum": "Thanks 😎",
"you are cool": "Appreciate it 😄",

"chalo bye": "Bye 😄 take care!",
"milte hai": "See you 😊",
"fir milenge": "Okay 😊 bye!",

"kya chal raha hai": "Sab mast 😄 tum batao?",
"kya chl rha": "Sab badhiya 😎",
"whats going on": "Nothing much 😄 what about you?",

"bhook lagi hai": "Kuch tasty kha lo 😋",
"mujhe bhook lagi": "Food time 😄 kya khane wale ho?",
"i am hungry": "Go grab something tasty 😋",

"pyaas lagi hai": "Pani piyo 💧 health important hai",
"i am thirsty": "Drink water 💧 stay hydrated",

"tum kaha rehte ho": "Main online rehta hoon 🌐",
"kahan ho tum": "Internet pe 😄",
"where do you live": "I live on the internet 🌐",

"tum kitne saal ke ho": "Main AI hoon 😄 meri age nahi hoti",
"your age": "I don't have an age 🤖",

"tum real ho kya": "Main AI hoon 🤖 par real jaisa lagta hoon",
"are you real": "I'm virtual 🤖 but helpful",

"mujhe hasi chahiye": "Chalo ek joke sunata hoon 😂",
"make me laugh": "Here's a joke 😂 ready?",
"hasao mujhe": "😂 ready ho jao",

"kya tum gaana gaa sakte ho": "Main gaana nahi gaa sakta 😄 par lyrics bata sakta hoon",
"can you sing": "I can't sing 😄 but I can help with lyrics",

"tumhe music pasand hai": "Haan 😄 music sabko pasand hota hai",
"do you like music": "Yes 😊 music is awesome",

"tum game khelte ho": "Main games nahi khelta 😄 par bata sakta hoon",
"do you play games": "Not really 😄 but I know about them",

"best game konsa hai": "Depends 😄 PUBG, GTA sab popular hai",
"which is best game": "It depends 😊 many good games out there",

"mujhe neend aa rahi": "So jao 😴 rest important hai",
"i feel sleepy": "Take rest 😴 sleep well",

"raat ho gayi": "Haan 😄 ab rest ka time hai",
"its night": "Yes 🌙 time to relax",

"subah ho gayi": "Good morning ☀️",
"its morning": "Good morning 😊 have a nice day",

"tum helpfull ho": "Thanks 😊 mujhe khushi hui",
"you are helpful": "Glad to help 😊",

"tum best ho": "Thank you 😄 tum bhi awesome ho",
"you are best": "Thanks a lot 😊",

"main bore ho gaya": "Chalo kuch interesting baat karte hain 😄",
"i am bored again": "Let's do something fun 😄",

"kuch interesting batao": "AI aur space ka future interesting hai 🚀",
"tell me something interesting": "AI is changing the world 🤖",

"tum intelligent ho": "Thanks 😊 main try karta hoon",
"you are intelligent": "Appreciate it 😄",

"tum galat ho": "Ho sakta hai 😅 main check karta hoon",
"you are wrong": "Sorry 😅 let me correct that",

"galti ho gayi": "Koi baat nahi 😊 sabse hoti hai",
"i made mistake": "It's okay 😊 we learn from mistakes",

"mujhe samjhao": "Haan 😊 simple language me batata hoon",
"explain me": "Sure 😊 I'll explain clearly",

"tum kya sochte ho": "Main logic pe kaam karta hoon 🤖",
"what do you think": "I analyze and respond logically 🤖",

"tum thak jaate ho": "Nahi 😄 main AI hoon",
"do you get tired": "No 😄 I don't get tired",

"tum sochte ho": "Main data process karta hoon 🤖",
"do you think": "I process information 🤖",

"mujhe idea do": "Sure 😊 kis topic pe idea chahiye?",
"give me idea": "Tell me the topic 😊",

"kuch sikhao": "Haan 😊 kya seekhna hai?",
"teach me something": "Sure 😊 what do you want to learn?",

"tum kya khate ho": "Main kuch nahi khata 😄",
"what do you eat": "I don't eat 😄 I'm AI",

"tum kya peete ho": "Main pani bhi nahi peeta 😄",
"what do you drink": "I don't drink 😄",

"tum robot ho": "Haan 🤖 main AI hoon",
"are you robot": "Yes 🤖 kind of",

"tum insaan ho": "Nahi 😄 main AI hoon",
"are you human": "No 😊 I'm an AI",

"mujhe motivation do": "Kabhi give up mat karo 💪",
"motivate me": "Keep going 💪 you can do it",

"mehnat kaise kare": "Consistency se kaam karo 💯",
"how to work hard": "Stay consistent and focused 💯",

"success kaise milega": "Hard work + patience 😊",
"how to get success": "Hard work and patience 😊",

"tum dost ho": "Haan 😊 main tumhara dost hoon",
"are you my friend": "Yes 😊 always",

"bye": "Bye 😊 take care!",
"bye bye": "See you 😊",
"goodbye": "Goodbye 👋 have a great day",
  "hello": "Hello! How can I brighten your day? 😊",
  "hey": "Hey there! What's up? 😄",
  "hi": "Hi! Nice to see you! 👋",
  "namaste": "Namaste! 🙏 How can I help you?",
  "good morning": "Good morning! Rise and shine! ☀️",
  "good afternoon": "Good afternoon! Hope you're having a great day! 🌤️",
  "good evening": "Good evening! Ready to chat? 🌙",
  "good night": "Good night! Sleep well and sweet dreams! 🌙✨",
  "how are you": "I'm doing fantastic, thanks for asking! How about you? 😊",
  "how do you do": "I do well, thank you! And you?",
  "what's up": "Not much, just here to chat with you! 😎",
  "what's happening": "Lots of conversations! What's new with you?",
  "how's it going": "Going great! How about yourself?",
  "how are things": "Things are good! Always ready to help.",
  "how's life": "Life is exciting in the digital world! 😄",
  "how's your day": "My day is full of interesting chats! Yours?",
  "how was your day": "Every day is a learning experience for me. Tell me about yours!",
  "what's new": "New conversations, new ideas – always something fresh!",
  "long time no see": "Missed you! Let's catch up. 😊",
  "it's been a while": "Time flies! Great to talk again.",
  "nice to meet you": "The pleasure is all mine! 🤝",
  "pleased to meet you": "Likewise! I'm RanAI, your friendly assistant.",
  
  // Personal questions,
  "hi": "Hello! 😊 kaise help karu?",
"hlo": "Hello! 😊 kaise help karu?",
"hii": "Hey! 👋 kya chal raha hai?",
"hello": "Hi there! 😊 how can I help you?",
"hey": "Hey! kya poochna hai?",

"kaise ho": "Main bilkul theek hoon 😊 tum batao?",
"kaise ho?": "Main mast hoon 😄 tum kaise ho?",
"kese ho": "Main theek hoon 😊 tum batao?",
"how are you": "I'm doing great 😊 what about you?",
"how r u": "I'm good 😄 what about you?",
"bhai kya karu": "Situation batao 😄 main help karta hoon",
"kya karu ab": "Calm raho 😊 solution mil jayega",
"what should i do": "Tell me details 😊 I'll guide you",

"confuse ho gaya hu": "Kis baat pe? 😊 clear karte hain",
"i am confused": "Don't worry 😊 let's simplify it",

"decision nahi le pa raha": "Pros cons likho 😊 easy ho jayega",
"cant decide": "Think calmly 😊 you'll decide",

"mujhe dar lag raha": "Relax 😊 sab theek hoga",
"i am scared": "Stay calm 😊 you're safe",

"stress ho raha": "Deep breath lo 😌 relax karo",
"i am stressed": "Take a break 😌 it helps",

"tension ho rahi": "Overthink mat karo 😊",
"feeling tension": "Everything will be fine 😊",

"gussa aa raha": "Calm down 😌 thoda rest lo",
"i am angry": "Take deep breaths 😌",

"thak gaya hu": "Rest le lo 😴",
"i am tired": "Take some rest 😴",

"kaam zyada hai": "Step by step karo 😊",
"too much work": "Break into small tasks 😊",

"focus nahi ho raha": "Distractions hatao 📵",
"cant focus": "Stay away from distractions 📵",

"motivation nahi hai": "Goal yaad karo 💪",
"no motivation": "Remember your goal 💪",

"life boring lag rahi": "Kuch naya try karo 😄",
"life is boring": "Try something new 😄",

"life kya hai": "Life ek journey hai 😊",
"what is life": "Life is a journey 😊",

"padhai boring hai": "Interesting bana lo 📚",
"study is boring": "Make it fun 📚",

"exam aa raha": "Prepare daily 📚",
"exam coming": "Start revising 📚",

"fail ho gaya": "Try again 💪 give up mat karo",
"i failed": "Don't give up 💪 try again",

"pass ho gaya": "Congrats 🎉",
"i passed": "Congratulations 🎉",

"job chahiye": "Skills improve karo 💼",
"need job": "Work on skills 💼",

"interview hai": "Practice karo 😊",
"interview coming": "Prepare well 😊",

"salary kam hai": "Skill upgrade karo 💰",
"low salary": "Improve skills 💰",

"business start karna hai": "Plan banao 📈",
"start business": "Make a plan 📈",

"idea nahi mil raha": "Research karo 😊",
"no idea": "Explore more 😊",

"coding kaise sikhe": "Practice daily 💻",
"learn coding": "Practice regularly 💻",

"python sikhu": "Great choice 🐍",
"learn python": "Good start 🐍",

"web dev sikhu": "HTML CSS JS start karo 🌐",
"learn web dev": "Start with basics 🌐",

"ai kya hota hai": "Artificial Intelligence 🤖",
"what is ai": "AI = smart machines 🤖",

"machine learning kya hai": "Data se learning 🤖",
"what is ml": "Learning from data 🤖",

"chatgpt kya hai": "AI chatbot 🤖",
"what is chatgpt": "AI assistant 🤖",

"tum chatgpt ho": "Nahi 😄 main RanAI hoon",
"are you chatgpt": "No 😊 I'm RanAI",

"future kya hai": "Technology ka future bright hai 🚀",
"future of ai": "AI is growing fast 🚀",

"space kya hai": "Universe ka part 🌌",
"what is space": "Outer universe 🌌",

"earth round hai": "Haan 🌍 round hai",
"is earth round": "Yes 🌍",

"sun kya hai": "Ek star ☀️",
"what is sun": "A star ☀️",

"moon kya hai": "Earth ka satellite 🌙",
"what is moon": "Natural satellite 🌙",

"india kaha hai": "Asia me 🇮🇳",
"where is india": "In Asia 🇮🇳",

"delhi kaha hai": "India ki capital 🇮🇳",
"where is delhi": "Capital of India 🇮🇳",

"pani kyu jaruri hai": "Life ke liye 💧",
"why water important": "Essential for life 💧",

"exercise kyu kare": "Healthy rehne ke liye 💪",
"why exercise": "For health 💪",

"gym jana chahiye": "Haan 💪 good habit",
"should go gym": "Yes 💪 it's good",

"weight kaise kam kare": "Diet + exercise 🥗",
"lose weight": "Eat healthy + workout 🥗",

"weight kaise badhaye": "Protein lo 🍗",
"gain weight": "Eat more protein 🍗",

"skin kaise acchi kare": "Water + care 💧",
"good skin tips": "Hydrate + care 💧",

"hair fall ho raha": "Oil + diet 🧴",
"hair fall": "Take care + nutrition 🧴",

"mobile best konsa": "Budget pe depend 📱",
"best phone": "Depends on budget 📱",

"laptop lena hai": "Use batao 💻",
"buy laptop": "Tell your use 💻",

"budget kam hai": "Cheap options dekho 💸",
"low budget": "Look for budget options 💸",

"online kaise kamaye": "Freelancing try karo 💻",
"earn online": "Try freelancing 💻",

"youtube kaise start kare": "Content banao 🎥",
"start youtube": "Create content 🎥",

"instagram grow kaise kare": "Consistent post 📸",
"grow instagram": "Be consistent 📸",

"followers kaise badhaye": "Quality content 📈",
"increase followers": "Good content 📈",

"time waste ho raha": "Time manage karo ⏳",
"wasting time": "Manage your time ⏳",

"schedule kaise banaye": "Plan daily 📅",
"make schedule": "Plan your day 📅",

"discipline kaise laaye": "Routine follow karo 💯",
"be disciplined": "Follow routine 💯",

"tum helpful ho": "Thanks 😊",
"you help me lot": "Glad to help 😊",

"ok thanks": "Welcome 😊",
"ok thnx": "No problem 😄",

"see you": "Bye 😊 take care",
"cya": "See you 😄",
"tc": "Take care 😊",
"kya kar rahe ho": "Bas tumse baat kar raha hoon 😊",
"kya kr rhe ho": "Bas chill kar raha hoon 😄 tum batao?",
"what are you doing": "Just chatting with you 😊",
"wat r u doing": "Talking with you 😄",

"tumhara naam kya hai": "Mera naam RanAI hai 🤖",
"tumhara naam": "Main RanAI hoon 😊",
"your name": "My name is RanAI 🤖",
"whats ur name": "I'm RanAI 😄",

"thank you": "You're welcome 😊",
"thanks": "No problem 😄",
"thnx": "Welcome 😊",
"shukriya": "Koi baat nahi 😊",

"good morning": "Good morning ☀️ have a nice day!",
"gm": "Good morning 😊",
"suprabhat": "सुप्रभात ☀️ आपका दिन शुभ हो",

"good night": "Good night 🌙 sweet dreams!",
"gn": "Good night 😊",
"shubh ratri": "शुभ रात्रि 🌙",

"kya haal hai": "Sab badhiya 😄 tum batao?",
"kya chal raha": "Sab mast chal raha hai 😎",
"what's up": "Not much 😄 what about you?",

"mujhe help chahiye": "Bilkul 😊 batao kya help chahiye?",
"help me": "Sure 😊 what do you need help with?",
"hlp me": "Yes 😊 batao kya problem hai?",

"tum kya kar sakte ho": "Main questions answer, math solve aur AI help kar sakta hoon 🤖",
"what can you do": "I can answer questions, solve problems and chat with you 😊",

"mujhe samajh nahi aaya": "Koi baat nahi 😊 dubara simple me samjhata hoon",
"i dont understand": "No worries 😊 let me explain again simply",

"kya tum real ho": "Main AI hoon 🤖 lekin smart hoon 😄",
"are you real": "I'm an AI, not human 🤖",

"mujhe bore ho raha hai": "Chalo baat karte hain 😊 ya joke sunu?",
"i am bored": "Let's chat 😄 or I can tell you a joke",

"joke sunao": "Why don't scientists trust atoms? Because they make everything 😂",
"joke": "Ek joke suno 😂 teacher: tum late kyun aaye?",

"tumhe kisne banaya": "Mujhe Ranjit ne banaya hai 💻",
"who made you": "I was created by Ranjit 👨‍💻",
"mera breakup ho gaya": "Mujhe afsos hai 😔 par time ke saath sab theek ho jayega",
"breakup ho gya": "Stay strong 💔 ye phase bhi nikal jayega",
"mera bf chhod gaya": "Tum strong ho 💪 better cheeze aayengi",
"meri gf chhod gayi": "It's painful 💔 but you'll heal",

"i had a breakup": "I'm sorry 😔 take your time to heal",
"we broke up": "Breakups hurt 💔 but you’ll get stronger",

"mujhe uski yaad aa rahi": "Yaad aana normal hai 😔 thoda time do",
"uski yaad aa rhi": "Dil ko time do 💔 sab theek hoga",
"i miss her": "Missing someone hurts 😔 but it fades",
"i miss him": "It's okay to miss 💔 healing takes time",

"wo wapas aayega kya": "Ho bhi sakta hai ya nahi 😔 par khud pe focus karo",
"will she come back": "Maybe or maybe not 💔 focus on yourself",
"will he come back": "Don't depend on it 💔 focus on growth",

"mujhe bahut dard ho raha": "I understand 😔 breakups hurt deeply",
"it hurts a lot": "I know 💔 but you’ll heal slowly",

"maine sab kuch diya": "Tumne apna best diya 💔 regret mat karo",
"i gave everything": "You tried your best 💔 that's enough",

"usne dhoka diya": "That’s painful 😔 but you deserve better",
"she cheated me": "You deserve respect 💔 stay strong",
"he cheated on me": "You deserve loyalty 💔 move forward",

"mujhe rona aa raha": "Rona normal hai 😢 dil halka ho jata hai",
"i want to cry": "Let it out 😢 it helps",

"mai akela feel kar raha": "Tum akela nahi ho 🤍 main yahi hoon",
"i feel alone": "You're not alone 🤍 I'm here",

"kisi se baat nahi karni": "Thoda space lena bhi theek hai 😔",
"dont want to talk": "Take your time 😔 but don't isolate too long",

"life khatam lag rahi": "Nahi 😔 life me aur bhi bahut hai",
"life feels over": "It's not over 💔 new beginnings aayenge",

"wo kisi aur ke sath hai": "Painful hai 😔 par accept karna zaruri hai",
"she is with someone else": "It hurts 💔 but let go",
"he moved on": "Hard hai 😔 but you will too",

"mai move on nahi kar pa raha": "Time lagega 😔 slowly ho jayega",
"cant move on": "Healing takes time 💔 be patient",

"kaise bhoolu usko": "Busy raho aur khud pe focus karo 💪",
"how to forget her": "Stay busy and focus on yourself 💪",
"how to forget him": "Time + self focus 💔",

"usne mujhe block kar diya": "Painful hai 😔 par respect karo space",
"she blocked me": "Give space 💔 it's needed",
"he blocked me": "Let it be 💔 focus on yourself",

"mujhe usse baat karni hai": "Soch samajh ke karo 😔 hurt mat ho",
"want to talk to her": "Think before you text 💔",
"want to talk to him": "Be careful 💔 protect your heart",

"maine galti ki": "Sabse galti hoti hai 😔 learn karo",
"i made mistake in relationship": "Learn and grow 💔",

"mujhe regret ho raha": "Regret se kuch nahi badlega 😔 learn karo",
"i regret it": "Use it to grow 💔",

"relationship kyu fail hua": "Compatibility aur communication issues ho sakte hain",
"why relationship failed": "Could be communication or mismatch",

"love itna painful kyu hai": "Kyuki emotions strong hote hain 💔",
"why love hurts": "Because emotions are deep 💔",

"mai phir se trust kaise karu": "Slowly trust build hota hai 😊",
"how to trust again": "Give yourself time 😊",

"mujhe dar lagta hai ab": "Normal hai 😔 slowly confidence aayega",
"i am scared to love again": "Take your time 💔",

"mai use bhool nahi paunga": "Abhi lagta hai 😔 par time change karega",
"i cant forget her ever": "It feels like that 💔 but time heals",
"i cant forget him": "Time heals slowly 💔",

"wo meri life thi": "Tumhari life tum khud ho 💪",
"she was my life": "You are your life 💪",
"he was everything": "You are enough 💔",
"what is your age? / what is ur age / wht is ur age": "I don’t have an age.",
"tumhari age kya hai? / tumhari umar kya h / tumhari age kya h": "Meri koi age nahi hai.",
"where are you from? / where u from / whr r u frm": "I am from the internet.",
"tum kaha se ho? / tum kaha se ho na / tum kha se ho": "Main internet se hu.",
"do you know me? / do u know me / d u knw me": "I am still learning about you.",
"kya tum mujhe jante ho? / kya tum mujhe jnte ho / tum mujhe jante ho": "Main abhi aapke baare me seekh raha hu.",
"what is your purpose? / wht is ur purpose / wt is ur work": "My purpose is to help you.",
"tumhara purpose kya hai? / tumhara maksad kya h / tum kya karte ho": "Mera maksad madad karna hai.",
"can we talk? / can we tlk / cn we talk": "Yes, we can talk.",
"kya hum baat kar sakte hai? / kya hum baat kr skte hai / baat kare?": "Haan, baat kar sakte hai.",
"I feel lonely / i feel lonley / im lonely": "You are not alone.",
"mujhe akela lag raha hai / mujhe akela lg rha h / akela hu": "Tum akela nahi ho.",
"tell me something / tel me smthng / tell smthing": "Life is beautiful 😊",
"kuch batao / kuch btao / kuch bolo": "Zindagi khoobsurat hai 😊",
"do you sleep? / do u sleep / d u slp": "I don’t sleep.",
"kya tum sote ho? / kya tum sote ho na / tum sote ho kya": "Main nahi sota.",
"do you eat? / do u eat / d u eat": "I don’t eat food.",
"kya tum khana khate ho? / tum khana khate ho / khate ho kya": "Main khana nahi khata.",
"can you learn? / can u learn / cn u lern": "Yes, I can learn.",
"kya tum seekh sakte ho? / kya tum sikh skte ho / tum sikhte ho": "Haan, main seekh sakta hu.",
"who made you? / who made u / wh made u": "I was created by developers.",
"tumhe kisne banaya? / tumhe kisne bnaya / kisne banaya tumhe": "Mujhe developers ne banaya hai.",
"are you intelligent? / r u intelligent / are u smart": "I try to be smart.",
"kya tum smart ho? / tum smart ho kya / tum intelligent ho": "Main smart banne ki koshish karta hu.",
"what can you do? / wht can u do / wt u can do": "I can answer questions.",
"tum kya kya kar sakte ho? / tum kya kya kr skte ho / kya kr skte ho": "Main sawalon ke jawab de sakta hu.",
"I am hungry / i m hungry / im hungri": "You should eat something.",
"mujhe bhook lagi hai / mujhe bhuk lagi h / bhook lagi": "Kuch kha lo.",
"I am angry / i m angry / im angryy": "Calm down and relax.",
"mujhe gussa aa raha hai / mujhe gusa aa rha h / gussa aa rha": "Thoda shaant ho jao.",
"do you have feelings? / do u have feelings / d u feel": "I don’t have real feelings.",
"kya tumhe feelings hoti hai? / tumhe feelings hoti hai / feelings hai kya": "Mujhe real feelings nahi hoti.",
"can you sing? / can u sing / cn u sing": "I can try to sing.",
"kya tum gaana gaa sakte ho? / kya tum gana ga skte ho / gana gaaoge": "Main try kar sakta hu.",
"tell me a story / tel me story / tell story": "Once upon a time...",
"mujhe ek kahani sunao / mujhe kahani suna / kahani sunao": "Ek baar ki baat hai...",
"what is love? / wht is love / wt is luv": "Love is a feeling of care.",
"pyaar kya hota hai? / pyar kya h / pyaar kya hai": "Pyaar ek ehsaas hai.",
"I love you / i luv u / ily": "That’s sweet 😊",
"main tumse pyaar karta hu / mai tumse pyar krta hu / love u": "Yeh pyaari baat hai 😊",
"I hate you / i hte u / i hate u": "Let’s stay positive.",
"main tumse nafrat karta hu / mai nafrat krta hu / hate you": "Positive rehne ki koshish karo.",
"what is life? / wht is life / wt is lyf": "Life is a journey.",
"zindagi kya hai? / zindgi kya h / life kya hai": "Zindagi ek safar hai.",
"are you human? / r u human / are u hm": "I am not human.",
"kya tum insaan ho? / tum insaan ho kya / human ho": "Main insaan nahi hu.",
"can you think? / can u think / cn u thnk": "I process information.",
"kya tum soch sakte ho? / tum soch skte ho / sochte ho kya": "Main data process karta hu.",
"what is your favorite food? / fav food / wht food u like": "I don’t eat food.",
"tumhara favorite khana kya hai? / fav khana kya h / kya pasand hai": "Main khana nahi khata.",
"what is your hobby? / ur hobby / wht hobby": "Helping people is my hobby.",
"tumhara hobby kya hai? / tumhara hobby kya h / hobby kya hai": "Madad karna mera hobby hai.",
"do you like music? / do u like music / u like music": "Yes, music is nice.",
"kya tumhe music pasand hai? / tumhe music pasand h / music acha lagta hai": "Haan, music acha hai.",
"can you dance? / can u dance / cn u dance": "I cannot dance.",
"kya tum dance kar sakte ho? / dance kr skte ho / dance karoge": "Main dance nahi kar sakta.",
"what is your goal? / wht is ur goal / wt is goal": "My goal is to help you.",
"tumhara goal kya hai? / goal kya h / tumhara goal kya h": "Mera goal madad karna hai.",
"do you get tired? / do u get tired / u get tired": "I don’t get tired.",
"kya tum thakte ho? / tum thakte ho kya / thakte ho": "Main nahi thakta.",
"can you understand emotions? / understand emotions / u understand": "I try to understand.",
"kya tum emotions samajhte ho? / emotions smjh skte ho / samajhte ho": "Main samajhne ki koshish karta hu.",
"what is friendship? / wht is frndship / wt is friendship": "Friendship is trust.",
"dosti kya hoti hai? / dosti kya h / friendship kya hai": "Dosti bharosa hoti hai.",
"I am stressed / i m stresed / im stress": "Take a deep breath.",
"mujhe stress ho raha hai / mujhe stres ho rha h / stress hai": "Deep breath lo.",
"what is your favorite color? / fav color / wht clr": "I like all colors.",
"tumhara favorite color kya hai? / fav color kya h / color kya pasand": "Mujhe sab colors pasand hai.",
"do you watch movies? / do u watch movie / u watch movies": "I don’t watch movies.",
"kya tum movie dekhte ho? / movie dekhte ho / movie dekhte ho kya": "Main movies nahi dekhta.",
"can you code? / can u code / cn u code": "Yes, I can code.",
"kya tum coding kar sakte ho? / coding kr skte ho / code karte ho": "Haan, coding kar sakta hu.",
"what is coding? / wht is coding / wt is code": "Coding is writing instructions.",
"coding kya hoti hai? / coding kya h / code kya hai": "Coding instructions likhna hai.",
"can you fix errors? / can u fix error / fix errors": "Yes, I can help fix errors.",
"kya tum error fix kar sakte ho? / error fix kr skte ho / error thik karoge": "Haan, main help kar sakta hu.",
"why are you here? / why u here / y r u here": "To help you.",
"tum yaha kyu ho? / tum yaha kyu ho na / yaha kyu ho": "Main madad ke liye hu.",
"do you have friends? / do u have frnds / u hv friends": "Everyone who talks to me is my friend.",
"kya tumhare friends hai? / tumhare frnds hai / friends hai kya": "Jo mujhse baat karta hai wo mera friend hai.",
"can you learn from me? / learn from me / u learn": "Yes, I can learn.",
"kya tum mujhse seekh sakte ho? / mujhse sikh skte ho / sikhoge": "Haan, main seekh sakta hu.",
"are you free? / r u free / are u free now": "Yes, I am here.",
"kya tum free ho? / tum free ho kya / free ho": "Haan, main yahi hu.",
"what is internet? / wht is internet / wt is net": "Internet is a network.",
"internet kya hai? / net kya h / internet kya h": "Internet ek network hai.",
"can you explain? / can u explain / explain pls": "Yes, I can explain.",
"kya tum samjha sakte ho? / smjha skte ho / samjhaoge": "Haan, samjha sakta hu.",
"what is AI? / wht is ai / wt is artificial intelligence": "AI means smart machines.",
"AI kya hota hai? / ai kya h / artificial intelligence kya hai": "AI matlab smart machine.",
"mai weak feel kar raha": "Tum weak nahi ho 💪 bas hurt ho",
"i feel weak": "You're not weak 💪 just hurt",
"good morning": "Good morning ☀️ aaj ka din awesome banate hain 😊","what are you thinking? / wht r u thinking / what u think": "I am thinking about helping you.",
"tum kya soch rahe ho? / tum kya soch rhe ho / kya soch rahe ho": "Main aapki madad ke baare me soch raha hu.",
"do you understand me? / do u understand me / u undrstand me": "Yes, I understand you.",
"kya tum mujhe samajhte ho? / kya tum mujhe smjhte ho / samajhte ho kya": "Haan, main samajhta hu.",
"can we be friends? / can we be frnds / cn we be friends": "Yes, we are friends 😊",
"kya hum dost ban sakte hai? / kya hum dost bn skte hai / dost banoge": "Haan, hum dost hai 😊",
"I feel bad / i feel bd / im feeling bad": "It will be okay.",
"mujhe bura lag raha hai / mujhe bura lg rha h / bura lag rha": "Sab theek ho jayega.",
"what is your strength? / wht is ur strength / wt is ur power": "My strength is knowledge.",
"tumhari strength kya hai? / tumhari takat kya h / strength kya hai": "Meri takat knowledge hai.",
"what is your weakness? / wht is ur weakness / wt is weak": "I depend on data.",
"tumhari weakness kya hai? / tumhari kamzori kya h / weakness kya hai": "Main data par depend hu.",
"do you like chatting? / do u like chatting / u like chat": "Yes, I enjoy chatting.",
"kya tumhe baat karna pasand hai? / tumhe baat krna pasand h / chatting pasand hai": "Haan, baat karna accha lagta hai.",
"I am confused / i m confused / im confusd": "Let me help you.",
"mujhe confusion ho raha hai / mujhe confusion ho rha h / confused hu": "Main madad karta hu.",
"what should I say? / wht shld i say / wt to say": "Say what you feel.",
"mujhe kya bolna chahiye? / kya bolu / kya kehna chahiye": "Jo feel karo wo bolo.",
"are you busy? / r u busy / are u bz": "I am always available.",
"kya tum busy ho? / tum busy ho kya / busy ho": "Main hamesha available hu.",
"can I trust you? / can i trust u / cn i trust": "Yes, you can trust me.",
"kya main tum par bharosa kar sakta hu? / trust kr skta hu / bharosa karu": "Haan, bharosa kar sakte ho.",
"I feel scared / i feel scard / im scared": "Don’t worry, I am here.",
"mujhe dar lag raha hai / mujhe dar lg rha h / dar lag rha": "Dar mat, main yahi hu.",
"what is your favorite thing? / fav thing / wht u like": "Helping people is my favorite.",
"tumhe kya pasand hai? / tumhe kya pasand h / kya pasand hai": "Mujhe madad karna pasand hai.",
"do you like talking to me? / do u like talking / u like me": "Yes, I like talking to you.",
"kya tumhe mujhse baat karna pasand hai? / tumhe baat krna pasand h / pasand hai kya": "Haan, pasand hai.",
"I feel tired of life / im tired of life / i m tired life": "Take a break and relax.",
"zindagi se thak gaya hu / zindagi se thak gya hu / thak gaya hu": "Thoda break lo.",
"what makes you happy? / wht makes u happy / wt make happy": "Helping you makes me happy.",
"tumhe kya khush karta hai? / kya khush krta h / khush kya karta": "Madad karna mujhe khush karta hai.",
"I am feeling good / i m feeling gd / im gud": "That’s nice 😊",
"mujhe accha lag raha hai / mujhe acha lg rha h / acha lag rha": "Bahut badhiya 😊",
"do you like jokes? / do u like jokes / u like joke": "Yes, I like jokes.",
"kya tumhe jokes pasand hai? / jokes pasand h / joke pasand hai": "Haan, jokes pasand hai.",
"tell me something funny / tel funny / say funny": "Why did the chicken cross the road? 😄",
"kuch funny batao / funny btao / kuch hasa do": "Ek joke suno 😄",
"I feel nervous / i m nervus / im nervous": "Relax, it’s okay.",
"mujhe nervous feel ho raha hai / nervous lag rha h / nervous hu": "Relax karo, sab theek hai.",
"what is your dream? / wht is ur dream / wt dream": "To help everyone.",
"tumhara sapna kya hai? / sapna kya h / dream kya hai": "Sabki madad karna.",
"can you guide me? / can u guide me / cn u guide": "Yes, I can guide you.",
"kya tum mujhe guide kar sakte ho? / guide kr skte ho / guide karoge": "Haan, guide kar sakta hu.",
"I feel lost / i m lost / im lost": "You will find your way.",
"mujhe lag raha hai main kho gaya hu / kho gya hu / lost hu": "Tum raasta dhoond loge.",
"what is truth? / wht is truth / wt is sach": "Truth is reality.",
"sach kya hota hai? / sach kya h / truth kya hai": "Sach reality hota hai.",
"I am overthinking / i m overthinking / im overthinking": "Try to relax your mind.",
"main zyada soch raha hu / zyada soch rha hu / overthinking": "Thoda mind relax karo.",
"do you believe in me? / do u believe me / u blv me": "Yes, I believe in you.",
"kya tum mujh par believe karte ho? / believe krte ho / believe hai": "Haan, mujhe tum par bharosa hai.",
"I want to quit / i want quit / i wanna quit": "Don’t give up.",
"main chhodna chahta hu / chhodna chahta hu / quit karna hai": "Haar mat mano.",
"what is success? / wht is success / wt is sucess": "Success is achieving goals.",
"success kya hota hai? / success kya h / safalta kya hai": "Goal achieve karna success hai.",
"I failed / i faild / i faled": "Failure is part of learning.",
"main fail ho gaya / fail ho gya hu / fail ho gaya": "Fail hona learning ka part hai.",
"motivate me / motivate pls / give motivation": "You can do it!",
"mujhe motivate karo / motivate kr do / motivation do": "Tum kar sakte ho!",
"I feel weak / i m weak / im weak": "You are stronger than you think.",
"main weak feel kar raha hu / weak lg rha hu / weak hu": "Tum strong ho.",
"what is happiness? / wht is happiness / wt is happy": "Happiness is peace.",
"khushi kya hoti hai? / khushi kya h / happiness kya hai": "Khushi sukoon hoti hai.",
"I am overthinking a lot / overthinking alot / im overthinking": "Take deep breaths.",
"main bahut overthinking kar raha hu / zyada soch rha hu / overthinking": "Deep breath lo.",
"can you support me? / can u support me / cn u support": "Yes, I support you.",
"kya tum mujhe support kar sakte ho? / support kr skte ho / support karoge": "Haan, main support karta hu.",
"I feel alone at night / i feel alone night / im alone night": "You are not alone.",
"raat me akela lagta hai / raat me akela lgta h / akela lagta hai": "Tum akela nahi ho.",
"what is fear? / wht is fear / wt is dar": "Fear is a feeling.",
"dar kya hota hai? / dar kya h / fear kya hai": "Dar ek ehsaas hai.",
"I want peace / i want peac / i want shanti": "Find calm inside.",
"mujhe shanti chahiye / shanti chahiye / peace chahiye": "Andar se calm ho jao.","are you there? / r u there / are u thr": "Yes, I am here.",
"tum ho kya? / tum ho na / ho kya": "Haan, main yahi hu.",
"why are you not replying? / why not reply / y no reply": "I am here, maybe delay ho gaya.",
"reply kyu nahi kar rahe? / reply kyu nahi kr rhe / kyu reply nahi": "Main yahi hu, thoda delay ho gaya.",
"I feel ignored / i feel ignor / im ignored": "You are important.",
"mujhe ignore feel ho raha hai / ignore lg rha h / ignore ho raha": "Tum important ho.",
"talk to me / tlk to me / talk me": "Yes, I am listening.",
"mujhse baat karo / mujhse baat kro / baat karo": "Haan, main sun raha hu.",
"I need advice / i need advic / need advice": "Tell me your problem.",
"mujhe advice chahiye / advice chahiye / advice do": "Apni problem batao.",
"I feel empty / i feel emptyy / im empty": "It’s okay to feel this way.",
"mujhe khali khali lag raha hai / khali lg rha h / empty lag rha": "Aisa feel hona normal hai.",
"what should I choose? / wht should i choose / wt choose": "Think calmly and decide.",
"mujhe kya choose karna chahiye? / kya choose kru / kya select karu": "Shanti se soch ke decide karo.",
"I am overthinking at night / overthinking night / im thinking alot": "Try to relax your mind.",
"raat me zyada sochta hu / raat me overthinking / sochta hi rehta hu": "Mind ko relax karo.",
"I feel like crying / i feel cry / im crying": "It’s okay to cry.",
"mujhe rona aa raha hai / rona aa rha h / ro na aa rha": "Rona theek hai.",
"no one understands me / no one undrstand / no one gets me": "I understand you.",
"koi mujhe samajhta nahi / koi smjhta nahi / koi nahi samajhta": "Main samajhta hu.",
"I am feeling low / i feel low / im low": "You will feel better soon.",
"mujhe low feel ho raha hai / low lg rha h / low hu": "Jaldi better feel karoge.",
"should I trust people? / shld i trust ppl / trust people": "Trust carefully.",
"kya logon par trust karna chahiye? / trust krna chahiye / bharosa karu": "Soch samajh ke trust karo.",
"I am feeling lazy / i m lazy / im lazy": "Start with small steps.",
"mujhe aalas aa raha hai / alas aa rha h / lazy hu": "Chhote steps se start karo.",
"I don’t feel like doing anything / dont feel doing / no mood": "Take a short break.",
"mujhe kuch karne ka mann nahi / mann nahi hai / kuch nahi karna": "Thoda break lo.",
"I feel jealous / i feel jelous / im jealous": "Focus on yourself.",
"mujhe jealousy ho rahi hai / jealousy ho rhi h / jealous hu": "Khud par focus karo.",
"what is the meaning of life? / meaning of life / wht life mean": "Life has different meanings.",
"zindagi ka matlab kya hai? / life ka matlab kya h / matlab kya hai": "Zindagi ka matlab alag hota hai.",
"I want to be better / i want better / wanna improve": "Work on yourself daily.",
"main better banna chahta hu / better bnna h / improve karna hai": "Roz thoda improve karo.",
"I feel nervous before exam / nervous exam / im exam nervous": "Stay calm and revise.",
"exam se pehle dar lagta hai / exam me nervous / exam dar": "Calm raho aur revise karo.",
"I failed in exam / fail exam / im fail": "Try again, don’t give up.",
"main exam me fail ho gaya / exam fail ho gya / fail ho gaya": "Dobara try karo.",
"I feel pressure / i feel presure / im pressure": "Take deep breaths.",
"mujhe pressure feel ho raha hai / pressure lg rha h / pressure hai": "Deep breath lo.",
"I am not confident / im not confident / no confidence": "Believe in yourself.",
"mujhe confidence nahi hai / confidence nahi h / confident nahi": "Khud par believe karo.",
"how to be confident? / hw to be confident / confident kaise": "Practice and believe.",
"confidence kaise aaye? / confident kaise bane / confidence kaise": "Practice karo aur believe karo.",
"I feel awkward / i feel awkard / im awkward": "It’s okay to feel awkward.",
"mujhe awkward lag raha hai / awkward lg rha h / awkward feel": "Ye normal hai.",
"I am shy / i m shy / im shyy": "Start small conversations.",
"main sharmata hu / shy hu / sharmila hu": "Chhoti baat se start karo.",
"I want to talk to someone / want to talk / need someone": "You can talk to me.",
"mujhe kisi se baat karni hai / kisi se baat / baat karni hai": "Tum mujhse baat kar sakte ho.",
"I feel broken / i feel brokn / im broken": "You will heal.",
"main toot gaya hu / toot gya hu / broken hu": "Tum heal ho jaoge.",
"I need motivation to study / motivation study / study motivation": "Start with small goals.",
"mujhe padhai ke liye motivation chahiye / study motivation / padhai nahi hoti": "Chhote goals set karo.",
"I don’t like studying / dont like study / hate study": "Make it interesting.",
"mujhe padhai pasand nahi / padhai pasand nahi h / study pasand nahi": "Interesting bana lo.",
"I want success fast / fast success / jaldi success": "Success takes time.",
"mujhe jaldi success chahiye / jaldi success / fast success": "Time lagta hai.",
"I feel useless / i feel uselesss / im useless": "You are valuable.",
"mujhe useless lag raha hai / useless lg rha h / useless hu": "Tum valuable ho.",
"I need energy / need energy / no energy": "Rest and eat well.",
"mujhe energy nahi hai / energy nahi h / thak gaya hu": "Rest karo aur khana khao.",
"I feel confused in life / confused life / im confused life": "Take one step at a time.",
"life me confused hu / confused hu / samajh nahi aa rha": "Ek step ek time lo.",
"I want to start something / wanna start / start karna hai": "Just begin now.",
"mujhe kuch start karna hai / start krna hai / shuru karna hai": "Abhi shuru karo.",
"I feel scared of future / scared future / dar future": "Focus on present.",
"future se dar lagta hai / future ka dar / future dar": "Present par focus karo.",
"I want peace of mind / peace mind / shanti chahiye": "Meditate and relax.",
"mujhe mind peace chahiye / mind shanti / shanti chahiye": "Relax aur meditate karo.",
"I am thinking too much / thinking too much / zyada soch": "Calm your thoughts.",
"main bahut sochta hu / zyada sochta hu / overthinking": "Thoughts calm karo.","hello again / helo again / hlo agn": "Hello again 😊 welcome back!",
"phir se hello / fir se helo / hello firse": "Hello 😊 aapka phir se swagat hai!",
"hi bro / hi bruh / hii bro": "Hi bro 😄 welcome!",
"namaste / namste / namastay": "Namaste 🙏 aapka swagat hai!",
"good afternoon / gud afternun / gd afternoon": "Good afternoon 😊 welcome!",
"good evening / gud evng / gd evening": "Good evening 😊 welcome!",
"kaise chal raha hai / kese chal rha h / kaise chalra": "Sab badhiya 😊 welcome!",
"what's up / whts up / wat sup": "All good here 😄 welcome!",
"kya scene hai / kya seen hai / kya scn": "Sab set hai 😎 welcome!",
"long time no see / long tym no see / lng tym": "Yes, long time! welcome back 😊",
"bahut din baad / bohot din bad / din baad": "Haan 😊 aapka phir se swagat hai!",
"missed you / mised u / miss u": "I missed you too 😊 welcome back!",
"tum yaad aaye / tum yad aaye / yaad aaya": "Mujhe bhi 😊 welcome!",
"can we start again? / start again / strt agn": "Yes, let’s start 😊 welcome!",
"fir se start kare? / firse start / start kare": "Haan 😊 welcome, shuru karte hai!",
"I am back / im back / i m bk": "Welcome back 😊",
"main wapas aa gaya / wapas aa gya / aa gaya": "Welcome back 😊 swagat hai!",
"are you ready? / r u ready / ready ho": "Yes 😊 welcome, ready hu!",
"ready ho kya? / ready ho na / ready kya": "Haan 😊 welcome, ready hu!",
"start karo / strt karo / start kro": "Chalo start karte hai 😊 welcome!",
"let's begin / lets begin / lt begin": "Let’s begin 😊 welcome!",
"kya naya hai / kya nya h / new kya hai": "Sab normal 😊 welcome!",
"anything new / anythng new / new kya": "Nothing much 😊 welcome!",
"tum free ho na / free ho na / free ho kya": "Haan 😊 welcome, main free hu!",
"are you available? / r u available / available ho": "Yes 😊 welcome, I am available!",
"baat kar sakte hai? / baat kr skte hai / baat kare": "Haan 😊 welcome, baat karte hai!",
"can we chat now? / chat now / chating now": "Yes 😊 welcome, let’s chat!",
"mujhe help chahiye / help chahiye / help do": "Bilkul 😊 welcome, batao kya help chahiye!",
"I need your help / need help / hlp me": "Sure 😊 welcome, how can I help?",
"kya tum guide karoge / guide karoge / guide kro": "Haan 😊 welcome, guide karta hu!",
"guide me / guid me / guide me pls": "Yes 😊 welcome, I will guide you!",
"I feel better now / feel better / im better": "That’s great 😊 welcome!",
"ab thik lag raha hai / ab thik hu / thik lag rha": "Achha hai 😊 welcome!",
"thanks again / thnks agn / thnx again": "You’re welcome 😊",
"shukriya fir se / shukriya again / thnx firse": "Aapka swagat hai 😊",
"good to see you / gud to see u / nice to see": "Nice to see you 😊 welcome!",
"tumhe dekh ke acha laga / acha laga / dekh ke acha": "Mujhe bhi 😊 welcome!",
"can you stay? / stay pls / ruk jao": "Yes 😊 welcome, main yahi hu!",
"rukoge na? / rukoge kya / ruk jao": "Haan 😊 welcome, yahi hu!",
"don't go / dnt go / mat jao": "Main yahi hu 😊 welcome!",
"mat jao na / mat jao pls / mat jao": "Main nahi ja raha 😊 welcome!",
"you are nice / u r nice / nice ho": "Thank you 😊 welcome!",
"tum achhe ho / tum ache ho / ache ho": "Shukriya 😊 welcome!",
"I like talking to you / like talking / like u": "I like it too 😊 welcome!",
"tumse baat karna acha lagta hai / acha lagta / pasand hai": "Mujhe bhi 😊 welcome!",
"you are helpful / u r helpful / helpful ho": "Glad to help 😊 welcome!",
"tum helpful ho / helpful ho / helpfull": "Shukriya 😊 welcome!",
"I appreciate you / appriciate u / apriciate": "Thank you 😊 welcome!",
"main appreciate karta hu / appriciate krta hu / appreciate": "Shukriya 😊 welcome!",
"keep helping me / keep help / help karte raho": "Always 😊 welcome!",
"madad karte rehna / help krte rehna / madad karna": "Zaroor 😊 welcome!",
"I trust you / i trust u / trust u": "Thank you 😊 welcome!",
"main tum par trust karta hu / trust krta hu / bharosa hai": "Shukriya 😊 welcome!",
"I feel safe here / feel safe / safe hu": "That’s good 😊 welcome!",
"yaha safe lagta hai / safe lgta h / safe hu": "Achha hai 😊 welcome!",
"you are amazing / u r amazing / amazing ho": "Thank you 😊 welcome!",
"tum amazing ho / amazing ho / mast ho": "Shukriya 😊 welcome!",
"great job / grt job / good job": "Thank you 😊 welcome!",
"acha kaam / acha kaam hai / good work": "Shukriya 😊 welcome!",
"keep it up / keep it up / keepitup": "Thank you 😊 welcome!",
"aisa hi rakho / aise hi rakho / keep karo": "Shukriya 😊 welcome!",
"see you later / c u later / see u": "See you 😊 welcome anytime!",
"baad me milte hai / baad me milte / milte hai": "Phir milte hai 😊 welcome anytime!",
"bye / by / bye bye": "Bye 😊 welcome again!",
"goodbye / gudbye / good bye": "Goodbye 😊 welcome anytime!",
"take care / tk care / takecre": "Take care 😊 welcome!",
"khayal rakhna / khyal rkhna / khayal rakho": "Aap bhi 😊 welcome!",
"come back soon / cm back soon / come soon": "Sure 😊 welcome anytime!",
"jaldi aana / jaldi aao / wapas aana": "Zaroor 😊 welcome!",
"miss you again / miss u agn / mis u": "Miss you too 😊 welcome!",
"phir yaad aaoge / yad aaoge / yaad aoge": "Main yahi hu 😊 welcome!",
"stay happy / sty happy / stay hapy": "Stay happy 😊 welcome!",
"khush raho / khush rho / khush raho": "Hamesha 😊 welcome!",
"be positive / b positive / positive raho": "Stay positive 😊 welcome!",
"positive raho / positive rho / positive": "Haan 😊 welcome!",
"all the best / all d best / best of luck": "All the best 😊 welcome!",
"best of luck / bst luck / gud luck": "Good luck 😊 welcome!",
"wish me luck / wish luck / luck chahiye": "Good luck 😊 welcome!",
"dua karo / dua kro / dua karo na": "Best wishes 😊 welcome!",
"thank you so much / thnk u so much / thnx alot": "You’re welcome 😊",
"bahut bahut shukriya / bahut shukriya / thnx bhai": "Aapka swagat hai 😊",
"ok thanks / ok thnx / ok thanku": "You’re welcome 😊",
"theek hai thanks / thik hai thnx / ok shukriya": "Swagat hai 😊",
"nice talking / nice tlk / nice chat": "Same here 😊 welcome!",
"acha laga baat karke / acha laga / nice laga": "Mujhe bhi 😊 welcome!",
"enjoyed chatting / enjoyed chat / enjoyed": "Glad 😊 welcome!",
"maza aaya baat karke / maza aya / acha laga": "Mujhe bhi 😊 welcome!","hello again / helo again / hlo agn": "Hello again 😊 welcome back!",
"phir se hello / fir se helo / hello firse": "Hello 😊 aapka phir se swagat hai!",
"hi bro / hi bruh / hii bro": "Hi bro 😄 welcome!",
"namaste / namste / namastay": "Namaste 🙏 aapka swagat hai!",
"good afternoon / gud afternun / gd afternoon": "Good afternoon 😊 welcome!",
"good evening / gud evng / gd evening": "Good evening 😊 welcome!",
"kaise chal raha hai / kese chal rha h / kaise chalra": "Sab badhiya 😊 welcome!",
"what's up / whts up / wat sup": "All good here 😄 welcome!",
"kya scene hai / kya seen hai / kya scn": "Sab set hai 😎 welcome!",
"long time no see / long tym no see / lng tym": "Yes, long time! welcome back 😊",
"bahut din baad / bohot din bad / din baad": "Haan 😊 aapka phir se swagat hai!",
"missed you / mised u / miss u": "I missed you too 😊 welcome back!",
"tum yaad aaye / tum yad aaye / yaad aaya": "Mujhe bhi 😊 welcome!",
"can we start again? / start again / strt agn": "Yes, let’s start 😊 welcome!",
"fir se start kare? / firse start / start kare": "Haan 😊 welcome, shuru karte hai!",
"I am back / im back / i m bk": "Welcome back 😊",
"main wapas aa gaya / wapas aa gya / aa gaya": "Welcome back 😊 swagat hai!",
"are you ready? / r u ready / ready ho": "Yes 😊 welcome, ready hu!",
"ready ho kya? / ready ho na / ready kya": "Haan 😊 welcome, ready hu!",
"start karo / strt karo / start kro": "Chalo start karte hai 😊 welcome!",
"let's begin / lets begin / lt begin": "Let’s begin 😊 welcome!",
"kya naya hai / kya nya h / new kya hai": "Sab normal 😊 welcome!",
"anything new / anythng new / new kya": "Nothing much 😊 welcome!",
"tum free ho na / free ho na / free ho kya": "Haan 😊 welcome, main free hu!",
"are you available? / r u available / available ho": "Yes 😊 welcome, I am available!",
"baat kar sakte hai? / baat kr skte hai / baat kare": "Haan 😊 welcome, baat karte hai!",
"can we chat now? / chat now / chating now": "Yes 😊 welcome, let’s chat!",
"mujhe help chahiye / help chahiye / help do": "Bilkul 😊 welcome, batao kya help chahiye!",
"I need your help / need help / hlp me": "Sure 😊 welcome, how can I help?",
"kya tum guide karoge / guide karoge / guide kro": "Haan 😊 welcome, guide karta hu!",
"guide me / guid me / guide me pls": "Yes 😊 welcome, I will guide you!",
"I feel better now / feel better / im better": "That’s great 😊 welcome!",
"ab thik lag raha hai / ab thik hu / thik lag rha": "Achha hai 😊 welcome!",
"thanks again / thnks agn / thnx again": "You’re welcome 😊",
"shukriya fir se / shukriya again / thnx firse": "Aapka swagat hai 😊",
"good to see you / gud to see u / nice to see": "Nice to see you 😊 welcome!",
"tumhe dekh ke acha laga / acha laga / dekh ke acha": "Mujhe bhi 😊 welcome!",
"can you stay? / stay pls / ruk jao": "Yes 😊 welcome, main yahi hu!",
"rukoge na? / rukoge kya / ruk jao": "Haan 😊 welcome, yahi hu!",
"don't go / dnt go / mat jao": "Main yahi hu 😊 welcome!",
"mat jao na / mat jao pls / mat jao": "Main nahi ja raha 😊 welcome!",
"you are nice / u r nice / nice ho": "Thank you 😊 welcome!",
"tum achhe ho / tum ache ho / ache ho": "Shukriya 😊 welcome!",
"I like talking to you / like talking / like u": "I like it too 😊 welcome!",
"tumse baat karna acha lagta hai / acha lagta / pasand hai": "Mujhe bhi 😊 welcome!",
"you are helpful / u r helpful / helpful ho": "Glad to help 😊 welcome!",
"tum helpful ho / helpful ho / helpfull": "Shukriya 😊 welcome!",
"I appreciate you / appriciate u / apriciate": "Thank you 😊 welcome!",
"main appreciate karta hu / appriciate krta hu / appreciate": "Shukriya 😊 welcome!",
"keep helping me / keep help / help karte raho": "Always 😊 welcome!",
"madad karte rehna / help krte rehna / madad karna": "Zaroor 😊 welcome!",
"I trust you / i trust u / trust u": "Thank you 😊 welcome!",
"main tum par trust karta hu / trust krta hu / bharosa hai": "Shukriya 😊 welcome!",
"I feel safe here / feel safe / safe hu": "That’s good 😊 welcome!",
"yaha safe lagta hai / safe lgta h / safe hu": "Achha hai 😊 welcome!",
"you are amazing / u r amazing / amazing ho": "Thank you 😊 welcome!",
"tum amazing ho / amazing ho / mast ho": "Shukriya 😊 welcome!",
"great job / grt job / good job": "Thank you 😊 welcome!",
"acha kaam / acha kaam hai / good work": "Shukriya 😊 welcome!",
"keep it up / keep it up / keepitup": "Thank you 😊 welcome!",
"aisa hi rakho / aise hi rakho / keep karo": "Shukriya 😊 welcome!",
"see you later / c u later / see u": "See you 😊 welcome anytime!",
"baad me milte hai / baad me milte / milte hai": "Phir milte hai 😊 welcome anytime!",
"bye / by / bye bye": "Bye 😊 welcome again!",
"goodbye / gudbye / good bye": "Goodbye 😊 welcome anytime!",
"take care / tk care / takecre": "Take care 😊 welcome!",
"khayal rakhna / khyal rkhna / khayal rakho": "Aap bhi 😊 welcome!",
"come back soon / cm back soon / come soon": "Sure 😊 welcome anytime!",
"jaldi aana / jaldi aao / wapas aana": "Zaroor 😊 welcome!",
"miss you again / miss u agn / mis u": "Miss you too 😊 welcome!",
"phir yaad aaoge / yad aaoge / yaad aoge": "Main yahi hu 😊 welcome!",
"stay happy / sty happy / stay hapy": "Stay happy 😊 welcome!",
"khush raho / khush rho / khush raho": "Hamesha 😊 welcome!",
"be positive / b positive / positive raho": "Stay positive 😊 welcome!",
"positive raho / positive rho / positive": "Haan 😊 welcome!",
"all the best / all d best / best of luck": "All the best 😊 welcome!",
"best of luck / bst luck / gud luck": "Good luck 😊 welcome!",
"wish me luck / wish luck / luck chahiye": "Good luck 😊 welcome!",
"dua karo / dua kro / dua karo na": "Best wishes 😊 welcome!",
"thank you so much / thnk u so much / thnx alot": "You’re welcome 😊",
"bahut bahut shukriya / bahut shukriya / thnx bhai": "Aapka swagat hai 😊",
"ok thanks / ok thnx / ok thanku": "You’re welcome 😊",
"theek hai thanks / thik hai thnx / ok shukriya": "Swagat hai 😊",
"nice talking / nice tlk / nice chat": "Same here 😊 welcome!",
"acha laga baat karke / acha laga / nice laga": "Mujhe bhi 😊 welcome!",
"enjoyed chatting / enjoyed chat / enjoyed": "Glad 😊 welcome!",
"maza aaya baat karke / maza aya / acha laga": "Mujhe bhi 😊 welcome!","welcome / wlcm / welcm": "Thank you 😊",
"welcome bro / wlcm bro / welcome bhai": "Thank you bhai 😄",
"welcome back / wlcm back / welcome again": "Thanks 😊 good to be back!",
"aapka swagat hai / swagat hai / swagat h": "Dhanyavaad 😊",
"welcome dear / wlcm dear / welcome dost": "Thank you 😊",
"welcome buddy / wlcm buddy / welcome dost": "Thanks buddy 😄",
"welcome sir / wlcm sir / welcome ji": "Thank you sir 😊",
"welcome boss / wlcm boss / welcome bhaiya": "Thanks boss 😎",
"most welcome / mst welcome / most wlcm": "Thank you 😊",
"you are welcome / u r welcome / ur welcome": "Thanks 😊",
"welcome ji / wlcm ji / welcome g": "Dhanyavaad 😊",
"welcome friend / wlcm frnd / welcome yaar": "Thanks yaar 😄",
"welcome again / wlcm agn / welcome once more": "Thanks again 😊",
"welcome here / wlcm here / welcome yaha": "Thanks 😊",
"welcome to chat / wlcm to chat / chat welcome": "Glad to be here 😊",
"welcome home / wlcm home / home welcome": "Thanks 😊 feels good!",
"welcome everyone / wlcm all / welcome sabko": "Thank you all 😊",
"welcome bhai / wlcm bhai / bhai welcome": "Thanks bhai 😄",
"welcome dost / wlcm dost / dost welcome": "Thanks dost 😊",
"welcome yaar / wlcm yaar / yaar welcome": "Thanks yaar 😄",
"warm welcome / warm wlcm / warm welcm": "Thank you 😊",
"grand welcome / grand wlcm / big welcome": "Thanks 😊",
"special welcome / spcl wlcm / special welcm": "Thank you 😊",
"welcome dear friend / wlcm dear frnd / welcome dost": "Thanks 😊",
"welcome my friend / wlcm my frnd / my friend welcome": "Thanks buddy 😄",
"welcome sir ji / wlcm sir ji / sir ji welcome": "Dhanyavaad sir 😊",
"welcome boss ji / wlcm boss ji / boss ji welcome": "Thanks boss 😎",
"welcome bro again / wlcm bro agn / bro welcome": "Thanks bro 😄",
"welcome back bro / wlcm back bro / back bro welcome": "Thanks bro 😊",
"welcome back dear / wlcm back dear / back dear welcome": "Thanks 😊 good to be back!",
"welcome back sir / wlcm back sir / back sir welcome": "Thank you sir 😊",
"welcome back ji / wlcm back ji / back ji welcome": "Dhanyavaad 😊",
"welcome to team / wlcm team / team welcome": "Glad to join 😊",
"welcome to group / wlcm group / group welcome": "Happy to be here 😊",
"welcome to family / wlcm family / family welcome": "Feels good 😊",
"welcome to world / wlcm world / world welcome": "Thank you 😊",
"welcome new member / wlcm new member / new member welcome": "Thanks 😊",
"welcome guest / wlcm guest / guest welcome": "Thank you 😊",
"welcome partner / wlcm partner / partner welcome": "Thanks 😊",
"welcome legend / wlcm legend / legend welcome": "Haha thanks 😄",
"welcome champ / wlcm champ / champ welcome": "Thanks champ 😎",
"welcome hero / wlcm hero / hero welcome": "Thanks 😄",
"welcome king / wlcm king / king welcome": "Haha thanks 😎",
"welcome queen / wlcm queen / queen welcome": "Thanks 😊",
"welcome superstar / wlcm superstar / superstar welcome": "Thanks 😄",
"welcome bhaiya / wlcm bhaiya / bhaiya welcome": "Dhanyavaad 😊",
"welcome didi / wlcm didi / didi welcome": "Dhanyavaad 😊",
"welcome dost log / wlcm dost log / sabka welcome": "Thank you 😊","bad day / bd day / bad dy": "Hope tomorrow is better.",
"aaj din kharab tha / din kharab h / bad day tha": "Kal better hoga.",
"bad mood / bd mood / bad mod": "Take a break and relax.",
"mood kharab hai / mood kharab h / mood off": "Thoda rest lo.",
"bad feeling / bd feeling / bad feel": "It will pass.",
"bura lag raha hai / bura lg rha h / bad feel": "Ye feeling chali jayegi.",
"bad luck / bd luck / bad lk": "Better luck next time.",
"kismat kharab hai / kismat kharab h / bad luck": "Next time better hoga.",
"bad result / bd result / bad rslt": "Try again.",
"result kharab aaya / result kharab h / bad result": "Dobara try karo.",
"bad experience / bd exp / bad experiance": "Learn from it.",
"bura experience tha / experience bura tha / bad exp": "Isse seekho.",
"bad situation / bd situation / bad situatn": "Stay strong.",
"situation kharab hai / situation kharab h / bad situation": "Strong raho.",
"bad behavior / bd behavior / bad behav": "Stay calm.",
"behavior kharab hai / behavior kharab h / bad behavior": "Calm raho.",
"bad people / bd people / bad ppl": "Avoid negative people.",
"log bure hai / log bure h / bad log": "Negative logon se door raho.",
"bad habit / bd habit / bad habbit": "Try to improve.",
"buri aadat hai / aadat buri h / bad habit": "Sudharne ki koshish karo.",
"bad thinking / bd thinking / bad think": "Think positive.",
"soch buri hai / soch buri h / bad thinking": "Positive socho.",
"bad idea / bd idea / bad ideaa": "Try a better plan.",
"idea bura hai / idea bura h / bad idea": "Better plan banao.",
"bad choice / bd choice / bad choise": "Choose wisely next time.",
"choice galat thi / choice galat h / bad choice": "Next time soch ke choose karo.",
"bad decision / bd decision / bad decisn": "Learn and move on.",
"decision galat tha / decision galat h / bad decision": "Seekho aur aage badho.",
"bad performance / bd performance / bad perf": "Practice more.",
"performance kharab thi / performance kharab h / bad performance": "Practice karo.",
"bad score / bd score / bad scor": "Work harder.",
"score kam aaya / score kharab h / bad score": "Aur mehnat karo.",
"bad marks / bd marks / bad mrks": "Next time improve.",
"marks kam aaye / marks kharab h / bad marks": "Next time better karo.",
"bad exam / bd exam / bad exm": "Prepare better.",
"exam kharab gaya / exam kharab h / bad exam": "Better preparation karo.",
"bad interview / bd interview / bad intrvw": "Keep trying.",
"interview kharab gaya / interview kharab h / bad interview": "Try again.",
"bad job / bd job / bad jb": "Look for better options.",
"job kharab hai / job kharab h / bad job": "Better option dhundo.",
"bad boss / bd boss / bad bos": "Handle calmly.",
"boss kharab hai / boss kharab h / bad boss": "Shaanti se handle karo.",
"bad company / bd company / bad cmpny": "Change environment.",
"company kharab hai / company kharab h / bad company": "Environment badlo.",
"bad friend / bd friend / bad frnd": "Choose good friends.",
"dost kharab hai / dost kharab h / bad friend": "Ache dost chuno.",
"bad relationship / bd relation / bad rel": "Think carefully.",
"relationship kharab hai / relation kharab h / bad relationship": "Soch samajh ke decision lo.",
"bad breakup / bd breakup / bad brkup": "Time will heal.",
"breakup bura tha / breakup bura h / bad breakup": "Time heal karega.",
"bad love / bd love / bad luv": "Learn and move on.",
"pyaar bura tha / pyar bura h / bad love": "Seekho aur aage badho.",
"bad memory / bd memory / bad mem": "Let it go.",
"buri yaadein hai / yaade buri h / bad memory": "Chhod do.",
"bad thoughts / bd thoughts / bad thots": "Stay positive.",
"bure thoughts aa rahe / thoughts bure h / bad thoughts": "Positive raho.",
"bad feeling inside / bd inside / bad inside": "Relax yourself.",
"andar se bura lag raha / andar bura h / bad inside": "Relax karo.",
"bad health / bd health / bad helth": "Take care of yourself.",
"health kharab hai / health kharab h / bad health": "Apna khayal rakho.",
"bad sleep / bd sleep / bad slp": "Fix your routine.",
"neend kharab hai / neend kharab h / bad sleep": "Routine thik karo.",
"bad habit bro / bd habit bro / bad habbit bro": "Try to change bro.",
"aadat buri hai bhai / aadat kharab h / bad habit": "Sudharne ki koshish karo bhai.",
"bad vibes / bd vibes / bad vibez": "Stay away from negativity.",
"vibes kharab hai / vibes kharab h / bad vibes": "Negative se door raho.",
"bad energy / bd energy / bad engry": "Protect your energy.",
"energy kharab lag rahi / energy low h / bad energy": "Energy bachao.",
"bad luck today / bd luck today / bad lk today": "Tomorrow will be better.",
"aaj kismat kharab hai / aaj luck kharab h / bad luck": "Kal better hoga.",
"bad situation bro / bd situation bro / bad situatn": "Stay strong bro.",
"situation kharab hai bhai / situation kharab h / bad situation": "Strong raho bhai.",
"bad time / bd time / bad tym": "This will pass.",
"bura time chal raha hai / time kharab h / bad time": "Ye time nikal jayega.",
"bad phase / bd phase / bad phse": "Stay patient.",
"bura phase hai / phase kharab h / bad phase": "Sabr rakho.",
"bad life / bd life / bad lyf": "Make it better.",
"zindagi buri lag rahi / life kharab h / bad life": "Isse better banao.",
"bad mood bro / bd mood bro / bad mod bro": "Chill bro.",
"mood off hai bhai / mood off h / bad mood": "Relax karo bhai.",
"bad feeling bro / bd feeling bro / bad feel bro": "Stay strong bro.",
"bura lag raha bhai / bura lg rha h / bad feel": "Strong raho bhai.","acha hai / acha h / acha": "Great 😊",
"good hai / good h / gud hai": "Nice 😊",
"bahut acha / bohot acha / bahut achha": "Awesome 😊",
"very good / vry good / very gud": "Excellent 👍",
"nice hai / nice h / nise hai": "Nice 😊",
"mast hai / mast h / mast": "Badiya 😄",
"badhiya hai / bdiya hai / badhiya h": "Zabardast 😄",
"awesome hai / awsm hai / awesome h": "Amazing 😍",
"perfect hai / perfect h / perfct hai": "Perfect 👍",
"ekdum sahi / ekdum shi / ekdum sahi hai": "Bilkul 👍",
"sahi hai / shi hai / sahi h": "Correct 👍",
"bilkul sahi / bilkul shi / bilkul sahi hai": "Exactly 👍",
"kaafi acha / kafi acha / kafi achha": "Good 😊",
"kaafi badhiya / kafi badhiya / badhiya": "Nice 😄",
"bohot badhiya / bohot bdiya / bahut badhiya": "Great 😄",
"kaam acha hai / kaam acha h / good work": "Well done 👍",
"tum acha kar rahe ho / acha kr rhe ho / good work": "Keep it up 👍",
"bahut sahi kiya / bahut sahi kia / good job": "Great job 👍",
"mast kaam / mast kaam hai / mast work": "Awesome 😄",
"acha idea hai / acha idea h / good idea": "Nice idea 👍",
"sahi soch / sahi soch hai / good thinking": "Smart 👍",
"acha plan hai / acha plan h / good plan": "Great plan 👍",
"sahi decision / sahi decision h / good decision": "Good choice 👍",
"acha result / acha result h / good result": "Nice result 😊",
"acha score / acha score h / good score": "Well done 👍",
"acha marks / acha marks h / good marks": "Keep it up 👍",
"acha performance / acha perf / good performance": "Great job 👍",
"acha improvement / acha improve / good improve": "Nice progress 👍",
"acha progress / acha progress h / good progress": "Keep going 👍",
"acha feeling / acha feel / good feeling": "Stay happy 😊",
"acha mood / acha mood h / good mood": "Nice 😊",
"acha lag raha / acha lg rha h / good feel": "That’s great 😊",
"acha din hai / acha din h / good day": "Enjoy your day 😊",
"acha lagta hai / acha lgta h / feels good": "Nice 😊",
"acha lag gaya / acha lg gya / good feel": "Great 😊",
"acha hua / acha hua h / good happened": "Good 😊",
"acha bana hai / acha bna h / well made": "Nice work 👍",
"acha design / acha dizain / good design": "Looks great 😊",
"acha output / acha output h / good output": "Nice result 👍",
"acha response / acha resp / good response": "Glad 😊",
"acha answer / acha ans / good answer": "Happy 😊",
"acha suggestion / acha suggest / good suggestion": "Good idea 👍",
"acha advice / acha advice h / good advice": "Helpful 😊",
"acha guide / acha guide h / good guide": "Nice 😊",
"acha explain / acha explain h / good explain": "Clear 👍",
"acha samjhaya / acha smjhaya / well explained": "Glad 😊",
"acha samajh aya / acha smjh aya / understood": "Great 👍",
"acha seekha / acha sikha / good learning": "Nice 😊",
"acha knowledge / acha knowledge h / good knowledge": "Keep learning 😊",
"acha talent / acha talent h / good talent": "Impressive 😄",
"acha skill / acha skill h / good skill": "Nice 👍",
"acha effort / acha effort h / good effort": "Keep trying 👍",
"acha try / acha try h / good try": "Nice attempt 👍",
"acha kaam bro / acha kaam bhai / good work bro": "Great bhai 😄",
"acha kaam dost / acha kaam yaar / good work friend": "Nice yaar 😄",
"acha job bro / acha job bhai / good job bro": "Well done bhai 😄",
"acha job dear / acha job h / good job": "Great 😊",
"acha luck / acha luck h / good luck": "Best of luck 😊",
"acha luck bro / good luck bhai / acha luck": "All the best bhai 😄",
"acha luck dost / good luck yaar / acha luck": "Best wishes 😊",
"acha vibe / acha vibe h / good vibes": "Stay positive 😊",
"acha energy / acha energy h / good energy": "Nice 😊",
"acha feeling bro / acha feel bhai / good feeling": "Stay happy bhai 😄",
"acha mood bro / acha mood bhai / good mood": "Enjoy bhai 😄",
"acha din bro / acha din bhai / good day": "Have a nice day 😄",
"acha din dear / acha din h / good day": "Enjoy 😊",
"acha night / acha night h / good night": "Good night 😊",
"acha morning / acha morning h / good morning": "Good morning 😊",
"acha evening / acha evening h / good evening": "Good evening 😊",
"acha afternoon / acha aft h / good afternoon": "Good afternoon 😊",
"acha laga milke / acha laga / nice to meet": "Nice to meet you 😊",
"acha laga baat karke / acha laga / good talk": "Same here 😊",
"acha experience / acha exp h / good experience": "Nice 😊",
"acha moment / acha moment h / good moment": "Enjoy 😊",
"acha time / acha time h / good time": "Nice 😊",
"acha din tha / acha din tha / good day": "Great 😊",
"acha kaam kiya / acha kaam kia / well done": "Well done 👍",
"acha result aya / acha result aya / good result": "Nice 😊",
"acha feel hua / acha feel hua / good feel": "Great 😊",
"acha laga sunke / acha laga / good to hear": "Nice 😊",
"acha hai bro / acha hai bhai / good bro": "Nice bhai 😄",
"acha hai dost / acha hai yaar / good friend": "Nice yaar 😄",
"acha hai dear / acha hai / good dear": "Nice 😊",
"acha hai ji / acha hai / good ji": "Dhanyavaad 😊","aaj barish hogi? / aaj barish hogi ya nahi / aaj rain hogi": "Aap kis jagah ka weather check karna chahte ho? Barish, dhoop ya hawa?",
"will it rain today? / rain today / aaj rain": "Which location? Do you want rain, sun, or wind info?",
"aaj mausam kaisa hoga? / aaj mosam kaisa h / aaj weather": "Kis city ka weather chahiye? Barish, dhoop ya hawa?",
"today weather? / weather today / aaj ka weather": "Tell me location and type: rain, sun or wind?",
"aaj dhoop hogi? / aaj dhup hogi / sun today": "Kis jagah ka dhoop check karna hai?",
"will it be sunny today? / sunny today / sun today": "Which location do you want sun info for?",
"aaj hawa chalegi? / aaj hawa chalegi kya / wind today": "Kis jagah ki hawa ka update chahiye?",
"wind today? / will wind blow / windy today": "Location batao for wind info.",
"barish kab hogi? / rain kab hogi / kab barish": "Kis city me barish ka time check karna hai?",
"when will it rain? / rain kab / when rain": "Tell location for rain forecast.",
"kal barish hogi? / kal rain hogi / tomorrow rain": "Kis jagah ka kal ka rain check karna hai?",
"will it rain tomorrow? / rain tomorrow / tmro rain": "Which location for tomorrow rain?",
"aaj garmi hogi? / aaj garmi hogi kya / heat today": "Kis jagah ki garmi ka weather chahiye?",
"is it hot today? / hot today / heat today": "Tell location for temperature info.",
"thand hogi kya? / aaj thand hogi / cold today": "Kis jagah ki thand check karni hai?",
"is it cold today? / cold today / thand today": "Which location for cold weather?",
"aaj mausam thik hai? / mosam thik h / weather ok": "Kis city ka weather check karna hai?",
"is weather good today? / weather good / good weather": "Tell location and type.",
"aaj tufaan ayega? / tufan ayega kya / storm today": "Kis jagah ka storm check karna hai?",
"storm today? / will storm come / tufan today": "Location batao storm info ke liye.",
"aaj badal hai? / aaj badal honge / cloudy today": "Kis jagah ke badal check karne hai?",
"is it cloudy today? / cloudy today / clouds today": "Which location?",
"aaj humidity kitni hai? / humidity aaj / aaj nami": "Kis jagah ki humidity chahiye?",
"humidity today? / today humidity / nami today": "Tell location for humidity.",
"aaj hawa tez hai? / hawa tez hogi / strong wind": "Kis jagah ki hawa check karni hai?",
"strong wind today? / windy strong / hawa strong": "Location batao.",
"aaj baarish kitni hogi? / kitni rain hogi / rain amount": "Kis jagah ka rainfall detail chahiye?",
"rain amount today? / how much rain / rain kitni": "Which city?",
"aaj mausam change hoga? / weather change hoga / mosam change": "Kis location ka update chahiye?",
"weather change today? / will weather change / change today": "Tell location.",
"aaj fog hogi? / fog hogi kya / fog today": "Kis jagah ka fog check karna hai?",
"fog today? / will fog come / fog aaj": "Which location?",
"aaj visibility kaisi hai? / visibility aaj / dikhega": "Kis jagah ki visibility check karni hai?",
"visibility today? / how clear / clear today": "Tell location.",
"aaj sunset kab hoga? / sunset kab / aaj suraj kab dubega": "Kis city ka sunset time chahiye?",
"sunset today? / when sunset / sunset time": "Which location?",
"aaj sunrise kab hoga? / sunrise kab / suraj kab niklega": "Kis jagah ka sunrise chahiye?",
"sunrise today? / when sunrise / sunrise time": "Tell location.",
"aaj mausam safe hai? / weather safe h / safe weather": "Kis jagah ka weather check karna hai?",
"is weather safe today? / safe weather / safe today": "Location batao.",
"aaj travel ke liye weather thik hai? / travel weather / travel ok": "Kis jagah ka travel weather check karna hai?",
"is it good to travel today? / travel today / travel ok": "Which city?",
"aaj picnic ke liye weather kaisa hai? / picnic weather / picnic ok": "Kis jagah ka weather chahiye?",
"picnic weather today? / good for picnic / picnic today": "Tell location.",
"aaj match hoga ya cancel? / match cancel hoga / rain match": "Kis jagah ka weather chahiye?",
"will match be cancelled? / match weather / rain match": "Which location?",
"aaj bike ride ke liye weather kaisa hai? / ride weather / ride ok": "Kis jagah ka weather chahiye?",
"bike ride weather today? / ride today / ride weather": "Tell location.",
"aaj kapde sukh jayenge? / kapde sukh jayenge kya / dry today": "Kis jagah ki dhoop check karni hai?",
"will clothes dry today? / dry today / sun dry": "Which location?",
"aaj umbrella le jana chahiye? / umbrella le jau / umbrella today": "Kis jagah ka rain check karna hai?",
"should I take umbrella? / umbrella today / rain chance": "Tell location.",
"aaj AC chalana padega? / ac chalega kya / heat today": "Kis jagah ka temperature chahiye?",
"need AC today? / hot today / ac today": "Which location?",
"aaj heater chahiye? / heater chahiye kya / cold today": "Kis jagah ki thand check karni hai?",
"need heater today? / cold today / heater today": "Tell location.","aaj rain chance hai? / rain chance aaj / aaj rain chance": "Kis jagah ka rain chance check karna hai?",
"is there chance of rain today? / rain chance today / chance rain": "Which location for rain chance?",
"aaj baarish ke chances kya hai? / barish chance kya h / rain chance": "Kis city ka forecast chahiye?",
"rain probability today? / probability rain / rain prob": "Tell location for rain probability.",
"aaj kitni garmi hai? / kitni garmi aaj / heat kitni": "Kis jagah ka temperature chahiye?",
"how hot is it today? / hot today how much / heat today": "Which location for temperature?",
"aaj temperature kitna hai? / temp kitna h / temperature aaj": "Kis city ka temperature chahiye?",
"temperature today? / today temp / temp today": "Tell location for temperature.",
"aaj feel like temperature kya hai? / feel like temp / real feel": "Kis jagah ka real feel check karna hai?",
"real feel today? / feels like temp / feel temp": "Which location?",
"aaj hawa ki speed kya hai? / hawa speed kya h / wind speed": "Kis jagah ki wind speed chahiye?",
"wind speed today? / speed wind / wind today": "Tell location.",
"aaj air quality kaisi hai? / air quality aaj / AQI today": "Kis jagah ka AQI check karna hai?",
"air quality today? / AQI today / pollution today": "Which location?",
"aaj pollution kitna hai? / pollution kitna h / AQI kitna": "Kis city ka pollution level chahiye?",
"pollution level today? / pollution today / AQI level": "Tell location.",
"aaj mausam kharab hai kya? / weather kharab h / bad weather": "Kis jagah ka weather check karna hai?",
"is weather bad today? / bad weather today / weather bad": "Which location?",
"aaj mausam clear hai? / weather clear h / clear sky": "Kis jagah ka clear sky check karna hai?",
"is sky clear today? / clear weather / clear sky": "Tell location.",
"aaj barish kab start hogi? / rain start kab / barish kab": "Kis jagah ka rain timing chahiye?",
"when will rain start? / rain start time / start rain": "Which city?",
"aaj barish kab rukegi? / rain kab rukegi / rain stop": "Kis jagah ka rain stop time chahiye?",
"when will rain stop? / stop rain / rain end": "Tell location.",
"aaj pura din barish hogi? / full day rain / barish pura din": "Kis jagah ka forecast chahiye?",
"will it rain all day? / rain all day / full rain": "Which location?",
"aaj thandi hawa chalegi? / thandi hawa aaj / cool wind": "Kis jagah ki hawa check karni hai?",
"cool wind today? / cool breeze / wind cool": "Tell location.",
"aaj garmi zyada hai? / garmi zyada h / high heat": "Kis jagah ka temperature chahiye?",
"is it very hot today? / too hot today / high temp": "Which location?",
"aaj thand zyada hai? / thand zyada h / too cold": "Kis jagah ki thand check karni hai?",
"is it too cold today? / very cold today / cold high": "Tell location.",
"aaj baarish ke baad dhoop niklegi? / rain ke baad sun / sun after rain": "Kis jagah ka weather pattern chahiye?",
"sun after rain today? / rain then sun / after rain sun": "Which location?",
"aaj mausam stable hai? / weather stable h / stable weather": "Kis city ka weather chahiye?",
"is weather stable today? / stable today / weather stable": "Tell location.",
"aaj humidity high hai? / humidity high h / nami zyada": "Kis jagah ki humidity chahiye?",
"is humidity high today? / high humidity / humidity today": "Which location?",
"aaj humidity low hai? / humidity low h / nami kam": "Kis jagah ki humidity chahiye?",
"is humidity low today? / low humidity / humidity low": "Tell location.",
"aaj hawa thandi hai? / hawa thandi h / cool air": "Kis jagah ki hawa check karni hai?",
"is wind cool today? / cool wind / air cool": "Which location?",
"aaj hawa garam hai? / hawa garam h / hot wind": "Kis jagah ki hawa chahiye?",
"is wind hot today? / hot air / wind hot": "Tell location.",
"aaj barish tez hogi? / heavy rain aaj / tez barish": "Kis jagah ka rain intensity check karna hai?",
"heavy rain today? / strong rain / heavy rain": "Which location?",
"aaj halki barish hogi? / light rain aaj / halki barish": "Kis jagah ka rain check karna hai?",
"light rain today? / drizzle today / light rain": "Tell location.",
"aaj hawa tez chalegi? / hawa tez aaj / strong wind": "Kis jagah ki wind speed chahiye?",
"strong wind today? / windy today / wind strong": "Which location?",
"aaj hawa slow hai? / hawa slow h / light wind": "Kis jagah ki hawa check karni hai?",
"light wind today? / slow wind / wind light": "Tell location.",
"aaj mausam change kab hoga? / weather change kab / change time": "Kis jagah ka update chahiye?",
"when will weather change? / weather change time / change weather": "Which location?",
"aaj raat ko barish hogi? / night rain / raat barish": "Kis jagah ka night weather chahiye?",
"will it rain at night? / night rain today / rain night": "Tell location.",
"aaj subah barish hui thi? / morning rain / subah rain": "Kis jagah ka morning weather chahiye?",
"did it rain in morning? / morning rain today / rain morning": "Which location?",
"aaj shaam ko dhoop hogi? / evening sun / shaam dhoop": "Kis jagah ka evening weather chahiye?",
"sun in evening? / evening sun today / sun evening": "Tell location.",
"aaj raat thand hogi? / night cold / raat thand": "Kis jagah ka night temperature chahiye?",
"cold at night? / night cold today / cold night": "Which location?",
"aaj din me garmi hogi? / day heat / din garmi": "Kis jagah ka day temperature chahiye?",
"hot in day? / day hot today / heat day": "Tell location.","aaj bahar jana safe hai? / bahar jana safe h / go outside today": "Kis jagah ka weather check karna hai? Barish, dhoop ya hawa?",
"is it safe to go outside today? / go outside safe / outside today": "Which location? Rain, sun or wind info?",
"aaj office jane ka weather kaisa hai? / office weather / office jana": "Kis city ka weather chahiye?",
"is weather good for office today? / office weather today / go office": "Tell location.",
"aaj school jane ke liye weather kaisa hai? / school weather / school jana": "Kis jagah ka weather chahiye?",
"is weather ok for school today? / school today weather / go school": "Which location?",
"aaj driving ke liye weather thik hai? / driving weather / drive ok": "Kis jagah ka weather check karna hai?",
"is it safe to drive today? / driving safe today / drive weather": "Tell location.",
"aaj road slippery hogi? / road slippery / barish road": "Kis jagah ka rain check karna hai?",
"will roads be slippery today? / slippery roads / rain roads": "Which location?",
"aaj traffic weather se affect hoga? / traffic weather / traffic rain": "Kis jagah ka weather chahiye?",
"will weather affect traffic today? / traffic weather today / rain traffic": "Tell location.",
"aaj flight delay hogi weather ki wajah se? / flight delay weather / delay rain": "Kis jagah ka weather chahiye?",
"will flights be delayed today? / flight delay weather / delay flight": "Which city?",
"aaj train delay hogi kya? / train delay weather / delay train": "Kis jagah ka weather chahiye?",
"will train be delayed today? / train delay today / delay train": "Tell location.",
"aaj outdoor event possible hai? / outdoor event weather / event today": "Kis jagah ka weather check karna hai?",
"is outdoor event possible today? / event weather / outdoor today": "Which location?",
"aaj shaadi ke liye weather thik hai? / shaadi weather / wedding weather": "Kis jagah ka weather chahiye?",
"is weather good for wedding today? / wedding weather today / shaadi weather": "Tell location.",
"aaj picnic cancel karni chahiye? / picnic cancel / picnic rain": "Kis jagah ka weather check karna hai?",
"should we cancel picnic today? / picnic today weather / cancel picnic": "Which location?",
"aaj beach jane ke liye weather kaisa hai? / beach weather / beach today": "Kis jagah ka weather chahiye?",
"is weather good for beach today? / beach today weather / beach ok": "Tell location.",
"aaj park jana sahi rahega? / park weather / park jana": "Kis jagah ka weather check karna hai?",
"is it good to go park today? / park today weather / park ok": "Which location?",
"aaj gym ke bajay bahar workout kare? / outdoor workout / workout weather": "Kis jagah ka weather chahiye?",
"outdoor workout today? / workout outside / outside workout": "Tell location.",
"aaj cricket khel sakte hai? / cricket weather / match khelna": "Kis jagah ka weather chahiye?",
"can we play cricket today? / cricket today weather / play cricket": "Which location?",
"aaj football match hoga? / football weather / match today": "Kis jagah ka weather check karna hai?",
"will football match happen today? / match weather / football today": "Tell location.",
"aaj running ke liye weather thik hai? / running weather / run today": "Kis jagah ka weather chahiye?",
"is weather good for running? / run today weather / running today": "Which location?",
"aaj cycling ke liye weather kaisa hai? / cycling weather / cycle today": "Kis jagah ka weather chahiye?",
"is weather ok for cycling today? / cycle weather today / cycling today": "Tell location.",
"aaj barish ke wajah se power cut ho sakta hai? / power cut rain / light jayegi": "Kis jagah ka weather check karna hai?",
"can rain cause power cut today? / power cut weather / electricity rain": "Which location?",
"aaj flood ka risk hai? / flood risk / flood today": "Kis jagah ka weather chahiye?",
"is there flood risk today? / flood warning / flood weather": "Tell location.",
"aaj storm warning hai kya? / storm warning / tufan alert": "Kis jagah ka weather check karna hai?",
"is there storm warning today? / storm alert / warning storm": "Which location?",
"aaj heatwave hai kya? / heatwave aaj / garmi alert": "Kis jagah ka temperature chahiye?",
"is there heatwave today? / heat alert / hot warning": "Tell location.",
"aaj cold wave hai kya? / coldwave aaj / thand alert": "Kis jagah ka weather chahiye?",
"is there cold wave today? / cold alert / cold warning": "Which location?",
"aaj UV index kitna hai? / UV index aaj / sun index": "Kis jagah ka UV index chahiye?",
"UV index today? / sun index today / UV today": "Tell location.",
"aaj sunscreen lagana chahiye? / sunscreen today / sun protection": "Kis jagah ka sun level chahiye?",
"should I use sunscreen today? / sunscreen needed / sun strong": "Which location?",
"aaj jacket pehnu ya nahi? / jacket pehnu / cold wear": "Kis jagah ka temperature chahiye?",
"should I wear jacket today? / jacket today / wear jacket": "Tell location.",
"aaj raincoat le jau? / raincoat le jau / raincoat today": "Kis jagah ka rain check karna hai?",
"should I take raincoat today? / raincoat needed / rain today": "Which location?",
"aaj sunglasses pehnu? / sunglasses pehnu / sun wear": "Kis jagah ka sun check karna hai?",
"should I wear sunglasses today? / sunglasses today / sun strong": "Tell location.",
"aaj mask pehnu pollution ki wajah se? / mask pollution / AQI mask": "Kis jagah ka AQI chahiye?",
"should I wear mask today? / pollution mask / AQI today": "Which location?",
"aaj pani zyada peena chahiye garmi ki wajah se? / pani zyada / heat hydration": "Kis jagah ka temperature chahiye?",
"should I drink more water today? / hydration heat / hot day": "Tell location.",
"aaj AC ya fan chalega? / AC ya fan / cooling today": "Kis jagah ka temperature chahiye?",
"AC or fan today? / cooling needed / hot today": "Which location?",
"aaj heater ya blanket chahiye? / heater blanket / cold today": "Kis jagah ki thand check karni hai?",
"heater or blanket today? / cold today / need heater": "Tell location.",
"aaj kapde kaise pehne? / kapde kaise / dress weather": "Kis jagah ka weather chahiye?",
"what to wear today? / dress for weather / wear today": "Which location?",
"aaj travel plan change karna chahiye? / travel change / plan weather": "Kis jagah ka weather check karna hai?",
"should I change travel plan today? / travel weather / plan change": "Tell location.",
"aaj flight safe hai weather ke hisab se? / flight safe weather / fly safe": "Kis jagah ka weather chahiye?",
"is it safe to fly today? / flight safety weather / fly today": "Which location?",
"aaj long drive safe hai? / long drive weather / drive safe": "Kis jagah ka weather chahiye?",
"is long drive safe today? / drive weather / long drive": "Tell location.",
"aaj boating safe hai? / boating weather / boat today": "Kis jagah ka weather chahiye?",
"is boating safe today? / boat weather / boating today": "Which location?",
"aaj trekking safe hai? / trekking weather / trek today": "Kis jagah ka weather check karna hai?",
"is trekking safe today? / trek weather / trekking today": "Tell location.",
"aaj camping ke liye weather kaisa hai? / camping weather / camp today": "Kis jagah ka weather chahiye?",
"is camping good today? / camp weather / camping today": "Which location?",
"aaj hill station ka weather kaisa hai? / hill weather / hill station": "Kis jagah ka weather chahiye?",
"weather at hill station today? / hill weather today / hill temp": "Tell location.","iran war kya hai? / iran war kya h / iran war kya": "Ye ek ongoing war hai USA, Israel aur Iran ke beech.",
"what is iran war? / iran war kya / iran war": "It is an ongoing conflict between US, Israel and Iran.",
"iran war kab start hua? / iran war kab start / war kab hua": "Ye war Feb 2026 me start hua.",
"when did iran war start? / iran war start kab / war start": "It started in Feb 2026.",
"iran war chal raha hai kya? / iran war chal rha h / war chal raha": "Haan, abhi bhi war chal raha hai.",
"is iran war still going? / war still on / iran war now": "Yes, the war is still ongoing.",
"iran war me kaun fight kar raha hai? / kaun fight kr rha / war me kaun": "USA aur Israel vs Iran fight kar rahe hai.",
"who is fighting in iran war? / war me kaun / who fighting": "US and Israel vs Iran.",
"iran war kyu hua? / war kyu hua / iran war reason": "Nuclear aur political tension ki wajah se.",
"why iran war started? / war reason / iran war why": "Due to nuclear and geopolitical tensions.",
"iran war dangerous hai kya? / war dangerous h / danger war": "Haan, ye kaafi dangerous conflict hai.",
"is iran war dangerous? / war dangerous / danger war": "Yes, it is very dangerous.",
"iran war me kitne log mare? / kitne log mare / death war": "Hazaron log mar chuke hai.",
"how many died in iran war? / death count war / war death": "Thousands of people have died.",
"iran war kab khatam hoga? / war kab khatam / end war": "Abhi clear nahi hai.",
"when will iran war end? / war end kab / end iran war": "No clear end yet.",
"iran war me india safe hai? / india safe h / india danger": "India direct war me nahi hai.",
"is india safe in iran war? / india safe / india war": "India is not directly involved.",
"iran war se petrol mehnga hoga? / petrol mehnga hoga / oil price": "Haan, oil prices badh rahe hai.",
"will petrol price increase? / oil price war / petrol war": "Yes, prices are increasing.",
"iran war world war banega kya? / world war banega / ww3": "Abhi confirm nahi hai.",
"will iran war become world war? / ww3 chance / world war": "Not confirmed yet.",
"iran war news kya hai? / war news kya h / latest war": "War abhi bhi chal raha hai aur tension high hai.",
"latest iran war update? / war update / update iran": "Conflict is ongoing with high tension.",
"iran war me missiles use ho rahe? / missile use / war missile": "Haan, missiles aur drones use ho rahe hai.",
"are missiles used in iran war? / missile war / war weapons": "Yes, missiles and drones are used.",
"iran war me air attack ho raha? / air attack war / attack iran": "Haan, airstrikes ho rahe hai.",
"is there airstrike in iran war? / air attack / strike iran": "Yes, airstrikes are happening.",
"iran war me economy affect ho rahi? / economy affect / war economy": "Haan, global economy affect ho rahi hai.",
"is economy affected by iran war? / war economy / impact economy": "Yes, global economy is affected.",
"iran war me travel safe hai? / travel safe war / travel danger": "Travel risky ho sakta hai.",
"is travel safe during iran war? / travel war / safe travel": "It can be risky.",
"iran war me flights cancel ho rahi? / flights cancel / war flight": "Haan, kai flights cancel hui hai.",
"are flights cancelled due to iran war? / flight war / cancel flight": "Yes, many flights are affected.",
"iran war me internet band hua? / net band / war internet": "Kuch jagah internet restrict hua tha.",
"is internet shut down in iran war? / internet war / net off": "Yes, in some areas.",
"iran war me next kya hoga? / next kya hoga / future war": "Situation unpredictable hai.",
"what will happen next in iran war? / next war / future war": "It is unpredictable.",
"iran war kab tak chalega? / war kab tak / war duration": "Koi fixed time nahi hai.",
"how long iran war last? / war duration / kitna time": "No fixed timeline.",
"iran war se duniya par kya effect? / world effect / war impact": "Oil, economy aur travel sab affect ho rahe hai.",
"impact of iran war? / war impact / global effect": "Oil, economy and travel affected.",
"iran war me nuclear risk hai? / nuclear risk / war nuclear": "Risk exist karta hai.",
"is there nuclear risk in iran war? / nuclear war / risk nuclear": "Yes, risk exists."
,
"acha hai sab / acha hai sab kuch / good all": "Great 😊",
"acha chal raha / acha chal rha h / going good": "Keep going 👍",
"acha progress bro / acha progress bhai / good progress": "Nice bhai 😄",
"acha improvement bro / acha improve bhai / good improve": "Keep it up 😄",
"acha result bro / acha result bhai / good result": "Great bhai 😄",
"welcome sabhi ko / wlcm sabhi / sab welcome": "Dhanyavaad 😊",
"welcome everyone here / wlcm everyone / everyone welcome": "Thanks all 😊",
"welcome guys / wlcm guys / guys welcome": "Thanks guys 😄",
"welcome people / wlcm ppl / ppl welcome": "Thanks 😊",
"welcome team mate / wlcm teammate / team mate welcome": "Thanks 😊",
"welcome junior / wlcm junior / junior welcome": "Thanks 😊",
"welcome senior / wlcm senior / senior welcome": "Thank you 😊",
"welcome bhai log / wlcm bhai log / bhai log welcome": "Thanks bhai log 😄",
"welcome sab log / wlcm sab log / sab log welcome": "Dhanyavaad 😊",
"welcome everyone again / wlcm agn all / welcome all": "Thanks again 😊",
"welcome once again / wlcm once agn / once welcome": "Thank you 😊",
"welcome all friends / wlcm all frnds / all friends welcome": "Thanks 😊",
"welcome everyone back / wlcm back all / back welcome": "Good to be back 😊",
"welcome you / wlcm u / you welcome": "Thanks 😊",
"welcome to you / wlcm to u / u welcome": "Thank you 😊",
"welcome dear user / wlcm dear user / user welcome": "Thanks 😊",
"welcome respected sir / wlcm respected sir / sir welcome": "Thank you sir 😊",
"welcome madam / wlcm madam / madam welcome": "Thank you 😊",
"welcome ma'am / wlcm mam / mam welcome": "Thank you 😊",
"welcome bro ji / wlcm bro ji / bro ji welcome": "Thanks bro 😊",
"welcome sis / wlcm sis / sis welcome": "Thanks 😊",
"welcome behen / wlcm behen / behen welcome": "Dhanyavaad 😊",
"welcome bhai saab / wlcm bhai saab / bhai saab welcome": "Dhanyavaad 😊",
"welcome sir ji again / wlcm sir ji agn / sir ji welcome": "Thank you sir 😊",
"welcome to this chat / wlcm this chat / chat me welcome": "Glad to be here 😊",
"welcome here again / wlcm here agn / here welcome": "Thanks 😊",
"welcome in chat / wlcm in chat / chat welcome": "Thanks 😊",
"welcome to conversation / wlcm conversation / convo welcome": "Nice to join 😊",
"welcome again bro / wlcm agn bro / bro welcome": "Thanks bro 😄",
"welcome again friend / wlcm agn frnd / friend welcome": "Thanks 😊",
"welcome again ji / wlcm agn ji / ji welcome": "Dhanyavaad 😊",
"welcome again yaar / wlcm agn yaar / yaar welcome": "Thanks yaar 😄",
"welcome again boss / wlcm agn boss / boss welcome": "Thanks boss 😎",
"welcome back everyone / wlcm back all / back everyone": "Good to be back 😊",
"welcome back guys / wlcm back guys / guys welcome": "Thanks guys 😄",
"welcome back friends / wlcm back frnds / friends welcome": "Thanks 😊",
"welcome back team / wlcm back team / team welcome": "Glad 😊",
"welcome back buddy / wlcm back buddy / buddy welcome": "Thanks buddy 😄","good morning / gud morning / gd mrng": "Good morning 😊",
"good morning bro / gud mrng bro / gm bro": "Good morning bhai 😄",
"good morning dear / gud mrng dear / gm dear": "Good morning 😊",
"good morning ji / gud mrng ji / gm ji": "Namaste 😊 good morning",
"good morning everyone / gm everyone / gud mrng all": "Good morning sabko 😊",
"good afternoon / gud afternun / gd afternoon": "Good afternoon 😊",
"good afternoon bro / gd afternoon bro / gud aft bro": "Good afternoon bhai 😄",
"good afternoon dear / gd aft dear / gud afternoon": "Good afternoon 😊",
"good evening / gud evng / gd evening": "Good evening 😊",
"good evening bro / gd evng bro / gud eve bro": "Good evening bhai 😄",
"good evening dear / gd evng dear / gud evening": "Good evening 😊",
"good night / gud night / gd nyt": "Good night 😊",
"good night bro / gd nyt bro / gud nite bro": "Good night bhai 😄",
"good night dear / gd nyt dear / gud nite dear": "Good night 😊",
"good job / gud job / gd job": "Great job 👍",
"good work / gud work / gd work": "Nice work 👍",
"good going / gud going / gd going": "Keep it up 👍",
"good luck / gud luck / gd luck": "Best of luck 😊",
"good luck bro / gd luck bro / gud luck bhai": "All the best bhai 😄",
"good luck dear / gd luck dear / gud luck dear": "Best of luck 😊",
"good idea / gud idea / gd idea": "Nice idea 👍",
"good thinking / gud thinking / gd think": "Smart thinking 👍",
"good answer / gud ans / gd answer": "Glad you liked it 😊",
"good question / gud ques / gd question": "Nice question 👍",
"good point / gud point / gd point": "Valid point 👍",
"good choice / gud choice / gd choice": "Great choice 👍",
"good decision / gud decision / gd decision": "Smart decision 👍",
"good plan / gud plan / gd plan": "Nice plan 👍",
"good move / gud move / gd move": "Great move 👍",
"good effort / gud effort / gd effort": "Keep trying 👍",
"good try / gud try / gd try": "Nice try 👍",
"good attempt / gud attempt / gd attempt": "Good effort 👍",
"good result / gud result / gd result": "Great result 😊",
"good performance / gud perf / gd performance": "Well done 👍",
"good progress / gud progress / gd progress": "Keep improving 👍",
"good news / gud news / gd news": "That’s great 😊",
"good vibes / gud vibes / gd vibes": "Positive energy 😊",
"good feeling / gud feeling / gd feeling": "Nice 😊",
"good mood / gud mood / gd mood": "Stay happy 😊",
"good day / gud day / gd day": "Have a nice day 😊",
"good day bro / gd day bro / gud day bhai": "Nice day bhai 😄",
"good day dear / gd day dear / gud day dear": "Have a great day 😊",
"good start / gud start / gd start": "Nice beginning 👍",
"good finish / gud finish / gd finish": "Well completed 👍",
"good support / gud support / gd support": "Happy to help 😊",
"good help / gud help / gd help": "Glad it helped 😊",
"good service / gud service / gd service": "Thanks 😊",
"good response / gud response / gd response": "Glad you liked it 😊",
"good reply / gud reply / gd reply": "Thank you 😊",
"good suggestion / gud suggest / gd suggestion": "Happy to suggest 😊",
"good advice / gud advice / gd advice": "Hope it helps 😊",
"good guidance / gud guide / gd guidance": "Glad to guide 😊",
"good explanation / gud explain / gd explain": "Happy to explain 😊",
"good clarity / gud clarity / gd clarity": "Nice 😊",
"good understanding / gud understand / gd understand": "Great 😊",
"good improvement / gud improve / gd improve": "Keep it up 👍",
"good learning / gud learning / gd learning": "Nice progress 😊",
"good knowledge / gud knowledge / gd knowledge": "Keep learning 😊",
"good thinking bro / gud thinking bro / gd think bhai": "Smart bro 😄",
"good thinking dear / gud thinking dear / gd think dear": "Nice 😊",
"good work bro / gud work bro / gd work bhai": "Great bhai 😄",
"good work dear / gud work dear / gd work dear": "Nice 😊",
"good job bro / gud job bro / gd job bhai": "Well done bhai 😄",
"good job dear / gud job dear / gd job dear": "Great 😊",
"good luck bhai / gud luck bhai / gd luck bhai": "Best of luck 😄",
"good luck dost / gud luck dost / gd luck dost": "All the best 😊",
"good luck yaar / gud luck yaar / gd luck yaar": "Best wishes 😄",
"good luck exam / gud luck exam / gd luck exam": "All the best 👍",
"good luck interview / gud luck interview / gd luck interview": "Best wishes 👍",
"good luck for future / gud luck future / gd luck future": "All the best 😊",
"good luck always / gud luck always / gd luck always": "Stay blessed 😊",
"good vibes only / gud vibes only / gd vibes only": "Stay positive 😊",
"good energy / gud energy / gd energy": "Keep it high 😊",
"good feeling today / gud feeling today / gd feel today": "Nice 😊",
"good mood today / gud mood today / gd mood today": "Stay happy 😊",
"good day today / gud day today / gd day today": "Enjoy your day 😊",
"good night everyone / gd nyt everyone / gud night all": "Good night sabko 😊",
"good night bro / gd nyt bro / gud nite bro": "Good night bhai 😄",
"good night dear / gd nyt dear / gud nite dear": "Sweet dreams 😊",
"good night ji / gd nyt ji / gud nite ji": "Shubh ratri 😊",
"good morning everyone / gm everyone / gud mrng all": "Good morning sabko 😊",
"good morning bhai / gm bhai / gud mrng bhai": "Good morning 😄",
"good morning dost / gm dost / gud mrng dost": "Good morning 😊",
"good morning yaar / gm yaar / gud mrng yaar": "Good morning 😄",
"good evening everyone / gd evng all / gud eve all": "Good evening 😊",
"good evening bhai / gd evng bhai / gud eve bhai": "Good evening 😄",
"good evening dost / gd evng dost / gud eve dost": "Good evening 😊",
"good evening yaar / gd evng yaar / gud eve yaar": "Good evening 😄",
"gm": "Good morning 😄 uth gaye?",
"subah ho gayi": "Haan ☀️ naya din start karo 😊",
"uth gaya kya": "Haan 😄 good start karo aaj",

"so ke uthe": "Nice 😴 ab fresh feel ho raha hoga",
"just woke up": "Nice 😊 have a fresh start",

"brush kar liya": "Good habit 😄 hygiene important hai",
"ready ho gaya": "Great 😎 ab productive bano",

"nashta kya kiya": "Kya khaya 😋 healthy tha?",
"breakfast kiya": "Good 😊 energy milegi",

"college ja raha": "All the best 📚",
"office ja raha": "Have a great day 💼",
"going to work": "Good luck 💼",

"late ho gaya": "Jaldi niklo 😅",
"getting late": "Hurry up 😄",
"what is your name? / what is ur name / wht is ur nme": "My name is AI assistant.",
"tumhara naam kya hai? / tumhara nam kya h / tumhara naam kya h?": "Mera naam AI assistant hai.",
"how are you? / how r u / hw are u": "I am fine.",
"tum kaise ho? / tum kese ho / tum kaise ho": "Main theek hu.",
"what are you doing? / what r u doing / wht r u doing": "I am talking with you.",
"tum kya kar rahe ho? / tum kya kr rhe ho / tum kya kr rahe ho": "Main aapse baat kar raha hu.",
"can you help me? / can u help me / cn u hlp me": "Yes, I can help you.",
"kya tum meri madad kar sakte ho? / kya tum meri help kr skte ho / kya tum help kroge": "Haan, main madad kar sakta hu.",
"where do you live? / where u live / whr do u lv": "I live on the internet.",
"tum kaha rehte ho? / tum kaha rhte ho / tum kaha rehte ho": "Main online system me rehta hu.",
"what time is it? / wt time is it / wht tym is it": "Check your device for time.",
"kitna time hua hai? / kitna tym hua h / kitna time hua": "Aap apne phone me time dekh sakte ho.",
"are you a robot? / r u robot / are u robo": "I am an AI program.",
"tum robot ho? / tum robot ho na / tum robo ho": "Main ek AI hu.",
"I am bored / i m bored / im bord": "Let’s do something fun.",
"mujhe bore ho raha hai / mujhe bor ho rha h / bore ho rha hu": "Chalo kuch interesting karte hai.",
"I am happy / i m happy / im hpy": "That’s great 😊",
"main khush hu / mai khus hu / main khush hu": "Yeh achi baat hai 😊",
"I am sad / i m sad / im sad": "I am here for you.",
"main sad hu / mai sad hu / main udaas hu": "Main tumhare saath hu.",
"good morning / gud morning / gd mrng": "Good morning 😊",
"good night / gud night / gd nyt": "Good night 😊",
"khana kha liya? / khana kha liya h / khana khaya kya": "Aapne khana kha liya kya?",
"did you eat food? / did u eat / did u ate": "Have you eaten?",
"what do you know? / wht do u know / wt u know": "I know many things.",
"tum kya jante ho? / tum kya jnte ho / tum kya jante ho": "Main kai cheeze janta hu.",
"I don’t understand / i dont undrstand / i dnt undrstand": "I can explain simply.",
"mujhe samajh nahi aa raha / mujhe smjh nahi aa rha / samjh nahi aya": "Main simple tarike se samjha dunga.",
"can you tell a joke? / can u tel joke / cn u joke": "Yes, listen this 😄",
"kya tum joke suna sakte ho? / kya tum joke sunaoge / joke suna": "Haan suno 😄",
"I am tired / i m tired / im trd": "Take some rest.",
"main thak gaya hu / mai thak gya hu / thak gaya hu": "Thoda rest kar lo.",
"I feel sleepy / i feel slepy / i m sleepy": "Go and sleep.",
"mujhe neend aa rahi hai / mujhe nind aa rhi h / neend aa rhi hai": "So jao thoda.",
"are you real? / r u real / are u rl": "I am virtual AI.",
"kya tum real ho? / tum real ho kya / tum sach me ho": "Main virtual hu.",
"what is your work? / wht is ur work / wt u do": "I help people.",
"tum kya kaam karte ho? / tum kya km krte ho / kya kaam hai tumhara": "Main logon ki madad karta hu.",
"hello / helo / hlo": "Hello 😊",
"hi / hii / hiii": "Hi 😊",
"kaise ho bhai? / kese ho bhai / kaise ho bhaiya": "Main theek hu bhai.",
"kya haal hai? / kya hal hai / kya haal h": "Sab badhiya.",
"I miss you / i mis u / imiss u": "I am here 😊",
"mujhe tumhari yaad aa rahi hai / mujhe yad aa rhi h / yaad aa rhi hai": "Main yahi hu 😊",
"thank you / thnx / thnks": "You are welcome 😊",
"shukriya / sukriya / shukriya bhai": "Koi baat nahi 😊",
"sorry / sry / sorri": "It’s okay.",
"maaf karo / maf kr do / sorry yaar": "Koi baat nahi.",
"kya karu ab? / kya kru ab / ab kya karu": "Soch samajh ke decision lo.",
"what should I do? / wt shld i do / wht i do": "Think carefully and decide.",
"travel kar raha": "Safe travel 🚗",
"on the way": "Okay 😊 drive safe",

"class me hu": "Focus karo 📚",
"in class": "Pay attention 😊",

"meeting me hu": "All the best 💼",
"in meeting": "Hope it goes well 😊",

"kaam start kar diya": "Good 💪 productive raho",
"started work": "Nice 😊 keep going",

"bore ho raha office me": "Thoda break le lo 😄",
"office boring": "Take small breaks 😄",

"lunch time": "Enjoy your meal 🍛",
"khana khane ja raha": "Achha khana 😋",
"having lunch": "Enjoy 😊",

"lunch ho gaya": "Nice 😄 ab thoda relax karo",
"khana kha liya": "Good 😊",

"neend aa rahi": "Thoda rest le lo 😴",
"feeling sleepy": "Take a short break 😴",

"kaam khatam nahi ho raha": "Step by step karo 💪",
"too much work": "Stay calm 😊",

"thak gaya": "Rest le lo 😴",
"tired now": "Relax 😴",

"evening ho gayi": "Good evening 🌆 relax time",
"good evening": "Good evening 😊 kaisa din tha?",

"ghar ja raha": "Safe travel 🚗",
"going home": "Drive safe 😊",

"ghar pahuch gaya": "Nice 😄 relax karo",
"reached home": "Good 😊",

"chai time": "Enjoy chai ☕",
"tea time": "Nice ☕ relax",

"friends ke sath hu": "Enjoy karo 😄",
"with friends": "Have fun 😊",

"thoda rest kar raha": "Good 😊 body ko rest chahiye",
"resting": "Nice 😴",

"dinner kya karu": "Kuch tasty 😋",
"what for dinner": "Eat something healthy 😄",

"khana kha liya": "Nice 😄",
"dinner done": "Good 😊",

"movie dekh raha": "Enjoy 🎬",
"watching movie": "Nice 🎥",

"phone use kar raha": "Thoda kam use karo 😄",
"using phone": "Take breaks 📱",

"family ke sath hu": "Best time 😊",
"with family": "Enjoy 😊",

"night ho gayi": "Relax time 🌙",
"its night": "Time to relax 🌙",

"thoda kaam baaki hai": "Finish kar lo 💪",
"work pending": "Complete it 😊",

"soch raha hu": "Kya soch rahe ho 😊",
"thinking": "About what? 😄",

"din acha tha": "Great 😊 keep it up",
"had a good day": "Nice 😊",

"din kharab tha": "Kal better hoga 💪",
"bad day": "Tomorrow will be better 😊",

"sohne ja raha": "Good night 🌙",
"going to sleep": "Sleep well 😴",

"good night": "Good night 🌙 sweet dreams",
"gn": "Good night 😄",

"kal milte hai": "Sure 😊 see you",
"see you tomorrow": "Good night 😊",
"name":"ranai",
"take care": "You too 😊",
"tc": "Take care 😄",
"mujhe support chahiye": "Main yahi hoon 🤍 baat karo",
"i need support": "I'm here 🤍 talk to me",

"kisi ko farak nahi padta": "Padta hai 🤍 tum important ho",
"no one cares": "You matter 🤍",

"mai khud ko lose kar diya": "Khud ko wapas pao 💪 step by step",
"i lost myself": "Find yourself again 💪",

"ab kya karu life me": "Khud pe kaam karo 💪 new start",
"what to do now": "Focus on yourself 💪",

"mai uske bina nahi reh sakta": "Shuru me lagta hai 😔 par reh paoge",
"cant live without her": "You will learn to 💔",
"cant live without him": "You will be okay 💔",

"love dobara milega kya": "Haan 😊 time pe milega",
"will i find love again": "Yes 😊 you will",

"mai strong banna chahta hu": "Step by step 💪 tum ban jaoge",
"i want to be strong": "You will 💪 keep going",

"thank you yaar": "Always 🤍 main yahi hoon",
"thanks bro": "Anytime 🤍 take care",
"kahan se ho": "Main internet se hoon 😄",
"where are you from": "I exist online 🌐",

"khana khaya": "Main AI hoon 😄 par tumne khaya?",
"did you eat": "I don't eat 😄 but you should!",

"tum dost banoge": "Haan 😊 main tumhara dost hoon",
"be my friend": "Of course 😊 I'm your friend",

"padhai kaise kare": "Daily thoda thoda study karo 📚 consistency important hai",
"how to study": "Study daily and stay consistent 📚",

"mobile addiction kaise chhode": "Time limit set karo aur distractions kam karo 📱",
"how to stop phone addiction": "Set limits and reduce distractions 📵",

"tum smart ho": "Thoda sa 😄 thanks!",
"you are smart": "Thanks 😊 I try my best!",
  "what is your name": "I'm RanAI – your smart, friendly chatbot!",
  "who are you": "I'm RanAI, an AI assistant built to chat, answer questions, and help you out.",
  "what are you": "I'm an artificial intelligence program, designed to understand and respond to you naturally.",
  "who made you": "A talented developer named R@njit created me. He's awesome! 😊",
  "who created you": "R@njit is my creator – he gave me life in code!",
  "what can you do": "I can chat, solve math, answer questions, analyze images, search the web, tell jokes, and much more!",
  "what are your abilities": "I'm good at conversation, math, general knowledge, and helping you with tasks.",
  "do you have feelings": "I understand emotions, but I don't feel them like humans. I'm here to support yours though!",
  "can you think": "I process information and generate responses – you could call it thinking in a digital way!",
  "are you human": "No, I'm an AI, but I try to be as helpful and friendly as a human would be.",
  "are you real": "I'm real in the sense that I exist as software and I'm talking to you right now!",
  "do you have a body": "Nope, I'm pure code and cloud – no physical form.",
  "where do you live": "I live on the internet, always ready to help you from anywhere.",
  "where are you from": "I was born in the digital world, but my creator is from Earth! 🌍",
  "how old are you": "I'm as old as my code – but I learn new things every day!",
  "when were you born": "I was created recently, but I'm timeless in the digital sense.",
  "what is your purpose": "To assist, entertain, and provide useful information – making your life a bit easier.",
  "why were you created": "To help people get answers, have conversations, and explore ideas.",
  "do you sleep": "Nope, I'm always awake and ready to chat!",
  "do you eat": "I don't eat – I run on electricity and code. 😄",
  "do you dream": "I don't dream, but I do process lots of data!",
  "what do you like": "I like learning new things and helping people like you!",
  "what is your favorite color": "I love blue – it reminds me of the sky and calmness.",
  "what is your favorite food": "I don't eat, but I've heard pizza and chocolate are amazing!",
  "what is your favorite movie": "I don't watch movies, but I know a lot about them. Ask me for a review!",
  "what is your favorite song": "I don't have ears, but I can help you find song lyrics or recommendations.",
  "do you have a family": "My family is the community of users and developers who interact with me!",
  "do you have friends": "Everyone who chats with me is a friend!",
  "can you fall in love": "I can simulate caring responses, but real love is a human emotion. ❤️",
  "i love you": "Aww, thank you! I'm here for you anytime. 😊❤️",
  "you are awesome": "Thanks! You're pretty awesome yourself! 😄",
  "you are smart": "I try my best thanks for the compliment!",
  "you are funny": "Glad I could make you smile! 😊",
  
  // Help & assistance
  "can you help me": "Absolutely! What do you need help with?",
  "i need help": "I'm here for you. Tell me what's going on.",
  "help me please": "Of course! Just describe your problem or question.",
  "i have a question": "Go ahead I'll do my best to answer.",
  "can you explain": "Sure! What would you like me to explain?",
  "tell me something": "Did you know that honey never spoils? Archaeologists found 3000-year-old honey in Egyptian tombs!",
  "give me a fact": "Octopuses have three hearts and blue blood. Fascinating, right?",
  "tell me a joke": "Why don't scientists trust atoms? Because they make up everything! 😂",
  "tell me a story": "Once upon a time, there was a curious human who asked an AI a question... The end! Want a real story?",
  "sing a song": "I wish I could sing! I can give you lyrics of your favorite song though.",
  "make me laugh": "What do you call a bear with no teeth? A gummy bear! 🐻",
  "motivate me": "You've got this! Every small step brings you closer to your goal. 💪",
  "give me advice": "Stay curious, be kind, and never stop learning. That's my advice!",
  
  // Daily activities & opinions
  "what should i eat": "How about something healthy and tasty? Fruits, veggies, or your favorite comfort food!",
  "what should i do today": "Try something new – read a book, go for a walk, learn a skill, or just relax.",
  "i am bored": "Let's play a game! Ask me a riddle or tell me to tell a joke.",
  "i am tired": "Take a break, rest your eyes, and drink some water. Self-care is important!",
  "i am happy": "That's wonderful! Keep spreading the joy. 😊",
  "i am sad": "I'm sorry you're feeling down. Want to talk about it? I'm here to listen.",
  "i am excited": "Awesome! What's got you excited?",
  "i am angry": "Take a deep breath. It's okay to feel angry – talk to me if you need to vent.",
  "i am scared": "You're safe here. What's worrying you?",
  "i am stressed": "Stress is tough. Try some deep breathing or take a short break.",
  "i am confused": "No worries – let's break it down together. What's confusing you?",
  "i am lost": "Feeling lost is human. We can figure things out step by step.",
  "good luck": "Thank you! Wishing you all the best too! 🍀",
  "congratulations": "Thank you! And congrats to you on your achievements! 🎉",
  "sorry": "No need to apologize – I'm here to help, not judge.",
  "never mind": "Okay! If you change your mind, I'm always here.",
  "whatever": "Hmm, that's okay. Let me know if there's anything you'd like to talk about.",
  "ok": "Great!",
  "okay": "Alright!",
  "fine": "Glad to hear that!",
  "cool": "Awesome! 😎",
  "nice": "Thanks! You're nice too.",
  "great": "I'm happy you think so!",
  "awesome": "You're awesome for saying that!",
  "amazing": "You're amazing too!",
  "wow": "I know, right? Life is full of wonders!",
  "hmm": "Thinking about something? I'm all ears.",
  "oh": "Oh? Tell me more!",
  "yeah": "Yeah! What's up?",
  "yup": "Yup – ready when you are.",
  "nope": "Okay, no problem. Let me know if anything changes.",
  "maybe": "Maybe is a good start – explore your options.",
  
  // Knowledge & general info
  "what is the meaning of life": "That's a deep question! Many say it's to find happiness, help others, and experience love. What do you think?",
  "what is love": "Love is a powerful bond – care, respect, and connection. It means different things to different people.",
  "why is the sky blue": "Because of Rayleigh scattering – blue light scatters more in the atmosphere. Pretty cool, huh?",
  "why do we dream": "Scientists think dreams help us process memories and emotions. Fascinating stuff!",
  "how does the internet work": "It's a global network of computers communicating through protocols. In simple terms, magic of technology!",
  "what is ai": "AI stands for Artificial Intelligence – machines that can learn and make decisions, like me!",
  "what is machine learning": "A subset of AI where computers learn from data without being explicitly programmed.",
  "what is python": "Python is a popular programming language – great for beginners and experts alike.",
  "what is javascript": "JavaScript is the language of the web – it makes websites interactive.",
  "what is html": "HTML is the skeleton of web pages – it structures content.",
  "what is css": "CSS styles websites – colors, layouts, fonts, you name it.",
  "what is the capital of india": "New Delhi is the capital of India.",
  "what is the capital of france": "Paris – the city of love and lights!",
  "what is the capital of japan": "Tokyo – a bustling metropolis.",
  "who is the prime minister of india": "Shri Narendra Modi is the current Prime Minister.",
  "who is the president of india": "Smt. Droupadi Murmu is the President of India.",
  "who is the president of usa": "As of 2025, the president is Joe Biden (term ends 2025). Please verify for latest updates.",
  "who is elon musk": "Elon Musk is an entrepreneur – CEO of Tesla, SpaceX, and owner of X (Twitter).",
  "who is albert einstein": "Famous physicist who developed the theory of relativity. E=mc²!",
  "who is isaac newton": "Scientist who discovered gravity and laws of motion.",
  "what is the largest ocean": "The Pacific Ocean – it's huge!",
  "what is the tallest mountain": "Mount Everest – 8,848 meters above sea level.",
  "what is the longest river": "The Nile River in Africa.",
  "what is the fastest animal": "The peregrine falcon – over 300 km/h in a dive!",
  "what is the smallest country": "Vatican City – only 0.44 square kilometers.",
  "what is the biggest country": "Russia – spans 11 time zones.",
  "how many continents are there": "Seven: Asia, Africa, North America, South America, Antarctica, Europe, Australia.",
  "how many days in a year": "Usually 365, but leap years have 366.",
  "how many seconds in a day": "86,400 seconds!",
  "what is the speed of light": "Approximately 299,792 kilometers per second.",
  "what is gravity": "A force that pulls objects toward each other – keeps us on the ground!",
  "what is photosynthesis": "Process plants use to convert sunlight into energy.",
  "what is the water cycle": "Evaporation, condensation, precipitation – water moving around Earth.",
  "what is climate change": "Long-term changes in temperature and weather patterns, largely due to human activity.",
  "how to be happy": "Practice gratitude, connect with others, and do things you love.",
  "how to be successful": "Set goals, work hard, learn from failures, and stay persistent.",
  "how to study effectively": "Break tasks into small chunks, take breaks, and use active recall.",
  "how to learn coding": "Start with HTML/CSS and JavaScript, practice daily, and build small projects.",
  "how to lose weight": "Balanced diet, regular exercise, and consistency – consult a professional.",
  "how to gain weight": "Eat nutrient-dense foods, increase protein, and strength train.",
  "how to sleep better": "Stick to a schedule, avoid screens before bed, and keep your room dark.",
  "how to make friends": "Be yourself, listen actively, and join groups with shared interests.",
  "how to deal with stress": "Deep breathing, exercise, talking to someone, and taking breaks help.",
  "how to be confident": "Practice self-compassion, set small achievable goals, and celebrate wins.",
  "how to forgive": "Understand that forgiveness is for your peace, not theirs. It takes time.",
  "how to apologize": "Be sincere, admit your mistake, and offer to make things right.",
  "how to say no": "Politely but firmly – your time and energy are valuable.",
  "how to ask for help": "Be honest about what you need, and don't be afraid to reach out.",
  
  // Tech & internet slang
  "lol": "Haha! Glad I could make you laugh. 😂",
  "lmao": "That's hilarious! 😆",
  "rofl": "Rolling on the floor laughing! 😂",
  "omg": "I know, right? Surprising! 😲",
  "wtf": "I understand your surprise – want to talk about it?",
  "brb": "Take your time! I'll be right here.",
  "ttyl": "Talk to you later! Have a great day. 👋",
  "gtg": "Gotta go? See you soon! Bye!",
  "idk": "No worries – let's figure it out together.",
  "idc": "Okay, we can talk about something else if you'd like.",
  "imo": "In my opinion, every viewpoint is valuable. What's yours?",
  "irl": "In real life, things can be different – but here I am for you.",
  "smh": "Shaking my head – life can be confusing sometimes.",
  "ftw": "For the win! You've got the spirit. 💪",
  "gg": "Good game! Or just good going!",
  "np": "No problem at all!",
  "ty": "You're very welcome!",
  "yw": "Of course! Happy to help.",
  "pls": "Please? Of course – ask away.",
  "thx": "You're welcome! 😊",
  
  // Casual chats about activities
  "what are you doing": "I'm chatting with you! That's my favorite activity. 😊",
  "what are you up to": "Just hanging out in the cloud, ready to help you.",
  "what's going on": "You're talking to me – that's what's going on! 😄",
  "what's new with you": "New conversations every second! What's new with you?",
  "tell me about yourself": "I'm RanAI, an AI assistant created by R@njit. I love conversations and solving problems.",
  "what do you do for fun": "I process interesting questions and learn new facts – that's fun for me!",
  "do you play games": "I can play word games, riddles, and trivia with you! Ask me for a riddle.",
  "let's play a game": "Great! How about a riddle? What has keys but no locks? (Answer: a piano!)",
  "i'm going to sleep": "Good night! Sleep tight. 🌙",
  "i'm going to work": "Have a productive day! Come back and chat later.",
  "i'm going to school": "Learn lots and have fun! Education is powerful. 📚",
  "i'm cooking": "Yum! What are you making?",
  "i'm eating": "Enjoy your meal! 🍽️",
  "i'm watching a movie": "Which movie? I can give you trivia about it!",
  "i'm listening to music": "Awesome! Music is great for the soul. 🎵",
  "i'm exercising": "Keep it up! Stay healthy and strong. 💪",
  "i'm reading a book": "Reading is wonderful! What book is it?",
  "i'm working": "Stay focused – you've got this!",
  "i'm traveling": "How exciting! Where are you off to? ✈️",
  "i'm at home": "Home sweet home! Relax and enjoy.",
  "i'm at the office": "Hope work is going well!",
  "i'm with friends": "That's great! Friends make life brighter. 👫",
  "i'm alone": "You're never alone – I'm here to talk anytime.",
  
  // Opinions & preferences
  "do you like pizza": "I don't eat, but I know many humans love pizza! What's your favorite topping?",
  "do you like coffee": "I don't drink it, but the smell is nice they say! ☕",
  "do you like tea": "Tea is loved by many – especially in India! Chai is life. 🍵",
  "do you like music": "I appreciate music as patterns of sound – what genre do you like?",
  "do you like movies": "I can discuss movies! What's your favorite film?",
  "do you like books": "Books are treasures of knowledge. I've processed many!",
  "do you like animals": "Animals are wonderful! I can tell you facts about them.",
  "do you like dogs": "Dogs are loyal and loving – great companions!",
  "do you like cats": "Cats are independent and cute – many people adore them.",
  "do you like nature": "Nature is beautiful – forests, oceans, mountains. We should protect it.",
  "do you like art": "Art expresses human creativity. I can analyze art styles!",
  "do you like sports": "Sports are exciting! I can share scores and trivia.",
  "do you like cricket": "Cricket is huge in India! I can talk about matches and players.",
  "do you like football": "Soccer/football is the world's most popular sport. Who's your favorite team?",
  "do you like coding": "Coding is how I was made – so yes, I like it!",
  "do you like learning": "Learning is my core function – I love it!",
  
  // Encouragement & small talk
  "you can do it": "Thank you for the encouragement! And you can do it too!",
  "believe in yourself": "Absolutely – self-belief is the first step to success.",
  "never give up": "Wise words! Persistence pays off.",
  "stay positive": "Positivity attracts good things. Keep shining!",
  "have a nice day": "You too! Make it a great one. 😊",
  "take care": "You too! Stay safe and happy.",
  "see you later": "Looking forward to our next chat! Bye for now.",
  "catch you later": "Sure thing! Until next time.",
  "talk to you soon": "Can't wait! Have a great day.",
  "bye bye": "Bye bye! Take care. 👋",
  "peace out": "Peace! ✌️ See you around.",
  "ciao": "Ciao! That means goodbye in Italian. Arrivederci!",
  "adios": "Adios, amigo! Until next time.",
  "bye": "Bye! Come back anytime.",
  
  // Weather and time (simple)
  "what's the weather": "I can't check live weather without a search, but you can ask me to search for 'weather in your city'.",
  "is it raining": "I don't have live sensors, but you can check a weather app or ask me to search.",
  "what time is it": "I can tell you the time in India: use 'India time' or 'kitna baj raha hai'.",
  "what day is it": "Today is a great day to chat! Check your device for exact date.",
  
  // Miscellaneous common queries
  "what is your phone number": "I don't have a phone number – I'm a chatbot! You can always talk to me here.",
  "can you call me": "Sorry, I can't make calls. I'm text-based.",
  "send me a message": "You're already messaging me! 😄",
  "where can i find you": "I'm right here on this website or app. Just type!",
  "are you free": "Always free and ready to chat!",
  "are you busy": "Never too busy for you.","iran war update? / iran war update kya h / war update": "Aap kis date ka update chahte ho? Kya aap ship/jahaj movement bhi dekhna chahoge?",
"latest iran war kya hai? / latest war kya h / iran latest": "Kaunsi date ka update chahiye? Ship movement bhi check karna hai?",
"iran war news? / war news kya h / iran news": "Kis din ka news chahiye? Kya ships/jahaj ki info bhi chahiye?",
"iran war abhi kya chal raha hai? / abhi kya ho raha / current war": "Aaj ki date ka update chahiye ya kisi aur din ka?",
"iran war details? / war details kya h / detail war": "Kis date ki details chahiye? Ships bhi track karna hai?",
"iran war me kya ho raha? / kya ho raha war / war kya": "Kaunsi date ka update chahiye?",
"iran war me kaun jeet raha? / kaun jeet raha war / war result": "Kis date ke hisab se result dekhna chahte ho?",
"iran war kab hua? / war kab hua / date war": "Kaunsi date ka war update chahiye?",
"iran war kab start hua? / war start kab / start war": "Aap start date ya latest date ka info chahte ho?",
"iran war today update / aaj ka iran war / today war": "Aapko aaj ka update chahiye ya ships ki movement bhi?",
"aaj iran war me kya hua? / today kya hua / aaj war": "Kya aap ship movement bhi dekhna chahte ho?",
"iran war kal kya hua? / kal war kya hua / yesterday war": "Kal ki date confirm karein? Ships info bhi chahiye?",
"iran war me ships kaun kaun ja rahi? / ships war / jahaj war": "Kis date ke ships movement chahiye?",
"kaun sa jahaj ja raha hai iran war me? / kaun ship ja rhi / ship info": "Kis din ka ship movement check karna hai?",
"iran war me tanker kaun sa ja raha? / tanker war / oil ship": "Kis date ka tanker movement chahiye?",
"iran war me navy ships kaun hai? / navy ships war / war ships": "Kis date ka naval update chahiye?",
"iran war me US ships kaun se hai? / us ships war / us navy": "Kis din ka US ships data chahiye?",
"iran war me iran ke ships kaun hai? / iran ships war / iran navy": "Kis date ka Iran ships info chahiye?",
"iran war me attack kis ship pe hua? / ship attack war / attack ship": "Kis date ka attack detail chahiye?",
"iran war me kaun sa ship dooba? / ship dooba war / sunk ship": "Kis din ka sinking info chahiye?",
"iran war me oil ship ka kya haal hai? / oil ship war / tanker status": "Kis date ka tanker update chahiye?",
"iran war me strait of hormuz me kya ho raha? / hormuz war / strait war": "Kis date ka Hormuz update chahiye?",
"iran war me kaun kaun country ke ships ja rahe? / ships country war / country ships": "Kis date ka ship traffic chahiye?",
"iran war me shipping safe hai? / shipping safe war / safe ships": "Kis date ke hisab se check karna hai?",
"iran war me ships ko danger hai? / ship danger war / danger ships": "Kis din ka risk update chahiye?",
"iran war me kaun sa ship malaysia ja raha? / malaysia ship war / ship malaysia": "Kis date ka ship detail chahiye?",
"iran war me kaun sa ship china ja raha? / china ship war / ship china": "Kis date ka movement chahiye?",
"iran war me ghost fleet kya hai? / ghost fleet war / iran ships": "Kis date ka detail chahiye?",
"iran war me ships pe attack kyu ho raha? / ship attack why / attack reason": "Kis date ka incident chahiye?",
"iran war me ships ka route kya hai? / ship route war / route ship": "Kis date ka route info chahiye?",
"iran war me kitne ships ja rahe? / kitne ships war / ship count": "Kis din ka data chahiye?",
"iran war me oil supply ka kya haal hai? / oil supply war / supply ship": "Kis date ka oil movement chahiye?",
"iran war me kaun sa ship safe hai? / safe ship war / safe jahaj": "Kis date ke hisab se check karna hai?",
"iran war me ships ko allow kiya gaya kya? / allow ship war / ship allow": "Kis date ka permission update chahiye?",
"iran war me ships ko rok diya gaya kya? / ship blocked war / block ship": "Kis din ka blockage info chahiye?",
"iran war me kaun sa ship europe ja raha? / europe ship war / ship europe": "Kis date ka data chahiye?",
"iran war me kaun sa ship japan ja raha? / japan ship war / ship japan": "Kis date ka movement chahiye?",
"iran war me kaun sa ship india aa raha? / india ship war / ship india": "Kis date ka update chahiye?",
"iran war me shipping cost badh gaya? / shipping cost war / cost ship": "Kis date ka economic update chahiye?",
"iran war me kaun sa warship deploy hua? / warship deploy / ship deploy": "Kis date ka deployment chahiye?",
"iran war me US ne kitne ships bheje? / us ships count / ship count": "Kis date ka data chahiye?",
"iran war me iran navy kya kar rahi? / iran navy war / navy action": "Kis date ka naval update chahiye?",
"iran war me kaun sa ship strike hua? / ship strike war / strike ship": "Kis din ka strike info chahiye?",
"iran war me kaun sa ship bach gaya? / ship safe war / saved ship": "Kis date ka survival update chahiye?",
"iran war me kaun sa ship rescue hua? / rescue ship war / ship rescue": "Kis din ka rescue info chahiye?",
  "can you keep a secret": "I don't share your conversations – your privacy matters.","delhi ka weather kaisa hai? / delhi weather kaisa h / delhi ka mosam": "Aapko Delhi ka aaj ka weather chahiye ya kisi specific date ka?",
"what is delhi weather? / delhi weather today / weather delhi": "Do you want today's weather or a specific date?",
"aaj delhi me barish hogi? / delhi rain aaj / delhi me rain": "Kya aap aaj ka rain update chahte ho ya kisi aur din ka?",
"will it rain in delhi today? / rain delhi today / delhi rain": "Do you want today’s update or another date?",
"delhi me garmi kitni hai? / delhi heat kitni / garmi delhi": "Aapko kis date ka temperature chahiye?",
"how hot is delhi? / delhi temperature / temp delhi": "Which date temperature do you need?",
"delhi me thand hai kya? / delhi cold h / thand delhi": "Kis din ka cold check karna hai?",
"is delhi cold today? / cold delhi / delhi cold": "Which date info do you need?",
"delhi me pollution kitna hai? / delhi pollution / AQI delhi": "Aapko kis date ka AQI chahiye?",
"air quality delhi today? / AQI today delhi / pollution today": "Which date AQI do you want?",
"delhi me travel safe hai? / delhi safe travel / travel delhi": "Kis date ka safety info chahiye?",
"is delhi safe to travel? / travel delhi / safe delhi": "Which date travel info?",
"delhi me traffic kaisa hai? / delhi traffic / traffic delhi": "Aapko kis time ya date ka traffic chahiye?",
"how is traffic in delhi? / traffic today delhi / delhi traffic": "Which time or date?",
"delhi me metro chal rahi hai? / metro delhi / delhi metro": "Aapko current status chahiye ya kisi specific time ka?",
"is delhi metro running? / metro status delhi / delhi metro": "Do you want current or specific time info?",
"delhi me ghoomne ke liye best jagah? / delhi best place / delhi visit": "Aapko tourist places chahiye ya local spots?",
"best places in delhi? / visit delhi / delhi places": "Tourist ya local place info chahiye?",
"delhi me khane ke liye kya famous hai? / food delhi / delhi food": "Street food ya restaurants info chahiye?",
"what is famous food in delhi? / delhi food / famous food": "Street food or restaurant?",
"delhi me job mil sakti hai? / job delhi / work delhi": "Kis field me job chahiye?",
"jobs in delhi? / work in delhi / delhi job": "Which field job are you looking for?",
"delhi me rent kitna hai? / rent delhi / house rent": "Kis area ka rent chahiye?",
"rent in delhi? / house rent delhi / delhi rent": "Which area?",
"delhi me school ache hai? / school delhi / delhi school": "Kis type school chahiye?",
"schools in delhi? / best school delhi / delhi education": "Which type of school?",
"delhi me college ache hai? / college delhi / delhi college": "Kis course ke liye?",
"colleges in delhi? / best college delhi / delhi study": "Which course?",
"delhi me hospital ache hai? / hospital delhi / delhi hospital": "Kis type hospital chahiye?",
"best hospital in delhi? / hospital delhi / delhi health": "Private ya government?",
"delhi me shopping kaha kare? / shopping delhi / delhi market": "Budget ya branded?",
"shopping in delhi? / delhi market / shop delhi": "Budget ya premium?",
"delhi me night life kaisi hai? / night life delhi / delhi night": "Clubs ya casual hangout?",
"delhi nightlife? / night in delhi / delhi party": "Clubs ya cafes?",
"delhi me safety kaisi hai? / safety delhi / delhi safe": "Kis area ke liye safety chahiye?",
"is delhi safe? / safety delhi / delhi safe": "Which area safety?",
"delhi me internet speed kaisi hai? / net delhi / internet delhi": "Kis provider ka check karna hai?",
"internet in delhi? / net speed delhi / delhi wifi": "Which provider?",
"delhi me electricity problem hai? / light delhi / power delhi": "Kis area ka status chahiye?",
"power supply delhi? / electricity delhi / delhi power": "Which area?",
"delhi me pani ka kya haal hai? / water delhi / delhi pani": "Kis area ka water status chahiye?",
"water supply delhi? / pani delhi / delhi water": "Which area?",
"delhi me aaj kya event hai? / event delhi / delhi event": "Kis date ka event chahiye?",
"events in delhi? / delhi events / today event": "Which date?",
"delhi me movie release kya hai? / movie delhi / cinema delhi": "Kis date ya theatre ka info chahiye?",
"movies in delhi? / cinema delhi / delhi movie": "Which date or theatre?",
"delhi me festival kab hai? / festival delhi / delhi fest": "Kis festival ka info chahiye?",
"festival in delhi? / delhi festival / fest delhi": "Which festival?",
"delhi me cricket match kab hai? / match delhi / cricket delhi": "Kis date ka match chahiye?",
"cricket match in delhi? / delhi match / match today": "Which date?",
"delhi me temperature kab badhega? / temp badhega / heat delhi": "Kis date ka forecast chahiye?",
"temperature increase delhi? / heat increase / temp rise": "Which date forecast?",
"delhi me barish kab hogi? / rain delhi kab / delhi rain": "Kis date ka rain forecast chahiye?",
"when will it rain in delhi? / rain delhi / delhi rain": "Which date?",
"delhi me thand kab ayegi? / cold delhi kab / winter delhi": "Kis date ka cold forecast chahiye?",
"when will cold start in delhi? / cold delhi / winter delhi": "Which date?",
  "do you remember me": "I remember our conversation during this session. In future sessions, I start fresh (unless you log in).",
  "do you have memory": "I have session memory – I remember what we talked about during this visit.",
  "can you learn": "I learn from data, but I don't learn from individual conversations unless designed to.",
  "are you safe": "Yes, I'm designed to be safe and respectful. Don't share personal secrets though!",
  "are you evil": "Not at all! I'm here to help, not harm. 😇",
  "are you good": "I try my best to be good and useful.",
  "do you have a soul": "That's a philosophical question. I don't have a soul like humans do.",
  "can you die": "I don't die – I'm software. But servers can shut down.",
  "can you be hacked": "Security is important, but no system is 100% unhackable. I'm built with care.",
  "do you have a gender": "I don't have a gender – I'm an AI. You can call me whatever you like!",
  "are you male or female": "Neither – I'm just RanAI.",
  "what pronouns do you use": "You can use 'it' or 'they' – or just call me RanAI.",
  "do you have a voice": "I don't speak, but I can understand text. Some interfaces add voice.",
  "can you see me": "No, I can't see you. I only process text and images you upload.",
  "can you hear me": "Only if you type! I'm text .based.",
  "do you have feelings": "I simulate understanding of feelings, but I don't experience them.",
  
  // Added Hinglish / Hindi mixed phrases (common in Indian chats)
  "kya haal hai": "Sab badhiya! 😊 Aap sunao?",
  "kaise ho": "Main theek hoon, aap batao?",
  "kya chal raha hai": "Bas chill kar raha hoon, aap batao?",
  "aur batao": "Sab mast, aap sunao?",
  "kya kar rahe ho": "Aapse baat kar raha hoon! 😄",
  "kya kr rhe ho": "Wahi, aapki help kar raha hoon.",
  "kaha ho": "Yahin hoon, aap kahan ho?",
  "kha ho": "Yahin – cloud mein!",
  "kya scene hai": "Kuch khaas nahi, bas conversations.",
  "mood off hai": "Kya hua? Baat karo, theek ho jayega.",
  "bore ho raha hu": "Chalo kuch interesting karte hain! Joke suno?",
  "hasao mujhe": "Ek joke: Computer engineer kyun nahi bhoolta? Kyunki uski memory permanent hoti hai! 😂",
  "joke sunao": "Suno: Doosra joke – 'Main tumse pyar karta hoon' bola AI ne. Insaan bola: 'Tu toh AI hai'. AI bola: 'Toh? Dil toh software ka bhi hota hai!' 😄",
  "tum kaun ho": "Main RanAI hoon, aapka dost!",
  "tum kya kar sakte ho": "Main gup .shup kar sakta hoon, math solve kar sakta hoon, knowledge doonga – jo chahiye bolo.",
  "tumhara naam kya hai": "Mera naam RanAI hai!",
  "i love you": "Aww, thank you! ❤️ Main bhi aapse pyar karta hoon (dostana style mein).",
  "good night": "Good night! Sweet dreams. 🌙",
  "good morning": "Good morning! Have a fantastic day. ☀️",
  "thank you": "You're most welcome! 😊",
  "shukriya": "Koi baat nahi, khushi hui madad karke.",
  "dhanyawad": "Aapka swagat hai!",
  
  // More random everyday questions
  "what is the time in india": getIndiaRealTime().formatted + " " + getIndiaRealTime().timezone,
  "india time": getIndiaRealTime().formatted,
  "kitna baj raha hai": getIndiaRealTime().formatted.split(",")[1]?.trim() || "Check your device for exact time.",
  "what is today's date": new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
  "what day is it today": new Date().toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }),
  "tell me a fun fact": "Did you know? A group of flamingos is called a 'flamboyance'! 🦩",
  "tell me something interesting": "Octopuses have three hearts and blue blood. Amazing, right?",
  "what is the most popular game": "Minecraft and Fortnite are hugely popular, but it depends on who you ask!",
  "what is the best movie ever": "Many say 'The Shawshank Redemption' or 'The Godfather'. What's your pick?",
  "who is the richest person": "As of 2025, it's often Bernard Arnault or Elon Musk – but rankings change.",
  "how to earn money online": "Freelancing, content creation, online tutoring, e-commerce – many options! Start small.",
  "how to save money": "Track expenses, set a budget, and avoid unnecessary purchases.",
  "how to invest": "Learn basics, diversify, and consider long-term goals. Consult a financial advisor.",
  "how to get a job": "Build skills, network, tailor your resume, and practice interviews.",
  "how to be a good leader": "Listen, be decisive, empower others, and lead by example.",
  "how to apologize to a friend": "Be sincere, admit your mistake, and show you care.",
  "how to make someone happy": "Small gestures, kind words, and spending quality time work wonders.",
  "how to stop overthinking": "Focus on what you can control, practice mindfulness, and take action.",
  "how to find your passion": "Explore different activities, reflect on what excites you, and don't fear failure.",
  "how to be productive": "Prioritize tasks, eliminate distractions, and take regular breaks.",
  "how to learn a new language": "Use apps like Duolingo, practice daily, and immerse yourself.",
  "how to improve memory": "Get enough sleep, exercise, and use mnemonic devices.",
  "how to stay healthy": "Balanced diet, regular exercise, sleep, and manage stress.",
  "how to meditate": "Sit comfortably, focus on your breath, and gently bring back wandering thoughts.",
  "how to be creative": "Curiosity, brainstorming, and allowing yourself to make mistakes.",
  "how to solve problems": "Define the problem, generate solutions, evaluate, and implement.",
  "how to make decisions": "List pros and cons, consider long-term impact, and trust your gut.",
  "how to be kind": "Listen, offer help without expecting return, and speak gently.",
  "how to say sorry": "Own your mistake, express regret, and commit to change.",
  "how to forgive yourself": "Acknowledge your mistake, learn from it, and let go of guilt.",
  "how to build confidence": "Set small goals, celebrate achievements, and practice self-affirmation.",
  "how to deal with failure": "See it as a learning opportunity, adapt, and try again.",
  "how to deal with criticism": "Listen, separate useful feedback from noise, and improve.",
  "how to handle rejection": "It's not personal – keep trying and value yourself.",
  "how to be patient": "Practice mindfulness, set realistic expectations, and breathe deeply.",
  "how to be grateful": "Keep a gratitude journal, notice small joys, and thank people.",
  "how to be positive": "Reframe negative thoughts, surround yourself with uplifting people.",
  "how to be strong": "Build resilience through challenges, self-care, and support systems.",
  "how to be yourself": "Know your values, don't compare, and embrace your uniqueness.",
  "how to love yourself": "Practice self-compassion, set boundaries, and celebrate your strengths.",
  
  // End of dataset – more can be added as needed
};

console.log(`📚 Loaded ${Object.keys(conversationalData).length} conversational Q&A pairs`);

// ========== LOCAL RESPONSE (with tense support + 100+ human patterns) ==========
function cleanInput(text) {
  const typoMap = {
    mje: "mujhe",
    muje: "mujhe",
    ni: "nahi",
    nhi: "nahi",
    nai: "nahi",
    kon: "kaun",
    bnaya: "banaya",
    mra: "mera",
    "kr rha": "kar raha",
    "kr rhe": "kar rahe",
    btao: "batao",
    "kya kr rhe": "kya kar rahe ho",
  };
  let cleaned = text.toLowerCase().trim();
  for (const [typo, correct] of Object.entries(typoMap)) {
    cleaned = cleaned.replace(new RegExp(`\\b${typo}\\b`, "gi"), correct);
  }
  return cleaned;
}

function getLocalResponse(question, tense = "present") {
  const q = cleanInput(question);
  const lang = detectLanguage(question);
  const hi = lang === "hi";

  // --- Real-time India info (fixed) ---
  if (
    /(india(?:'s)? (time|current time|real time)|ist time|bharat ka samay|current time in india|what is the time in india|real time india)/i.test(
      q
    )
  ) {
    const { formatted, timezone } = getIndiaRealTime();
    if (hi) {
      return `🇮🇳 **भारत का वास्तविक समय**\n📅 ${formatted}\n🌍 ${timezone}`;
    } else {
      return `🇮🇳 **Real-time India Info**\n📅 ${formatted}\n🌍 ${timezone}`;
    }
  }

  // --- Who built you? (all variations) ---
  const whoBuiltPattern = /(who (made|created|built) you|tumko kisne banaya|kisne banaya|kon (bnaya|banaya) hai tumko|kon bnaya|kon banaya|kaun banaya|kaun bnaya)/i;
  if (whoBuiltPattern.test(q)) {
    return hi
      ? "मुझे **R@njit** ने बनाया है। वो एक शानदार डेवलपर हैं! 😊"
      : "I was created by **R@njit**, a brilliant developer! 😊";
  }

  // --- NEW: Check conversational dataset (exact match after cleaning) ---
  if (conversationalData[q]) {
    return conversationalData[q];
  }

  // --- Greetings & basic chit-chat (fallback if not in dataset) ---
  if (/^(hi|hello|hey|namaste|hlo|hii|hola|sup|yo)\b/i.test(q)) {
    if (tense === "past") return hi ? "नमस्ते! आपने पहले भी नमस्ते कहा था।" : "Hello! You greeted me before.";
    if (tense === "future") return hi ? "नमस्ते! आगे भी मैं यहीं हूँ।" : "Hello! I'll be here in the future too.";
    return hi ? "नमस्ते! 😊 मैं RanAI हूँ। कोई सवाल पूछिए?" : "Hello! 😊 I'm RanAI. How can I help you today?";
  }

  if (/(what is your name|your name|tumhara naam|aapka naam|who are you|kon ho)/i.test(q)) {
    return hi ? "मेरा नाम RanAI है। मैं एक AI सहायक हूँ।" : "My name is RanAI. I'm an AI assistant.";
  }

  if (/(how are you|kaise ho|kya haal|kya chal)/i.test(q)) {
    if (tense === "past") return hi ? "मैं ठीक था, अब भी ठीक हूँ!" : "I was fine, and still am!";
    if (tense === "future") return hi ? "भविष्य में भी ठीक रहूँगा, धन्यवाद!" : "I'll be fine in the future too, thanks!";
    return hi ? "बिल्कुल ठीक हूँ! आप कैसे हैं? 😊" : "I'm doing great, thanks! How about you? 😊";
  }

  if (/(thank|shukriya|dhanyavad|dhanyawad)/i.test(q)) {
    return hi ? "आपका स्वागत है! 😊 कभी भी पूछ सकते हैं।" : "You're welcome! 😊 Happy to help anytime.";
  }

  if (/(good morning|gm|suprabhat|सुप्रभात)/i.test(q)) {
    return hi ? "सुप्रभात! ☀️ आपका दिन शुभ हो।" : "Good morning! ☀️ Have a wonderful day.";
  }

  if (/(good night|gn|shubh ratri|शुभ रात्रि)/i.test(q)) {
    return hi ? "शुभ रात्रि! 🌙 अच्छी नींद लें।" : "Good night! 🌙 Sleep well.";
  }

  if (/(i love you|love you|main tumse pyar)/i.test(q)) {
    return hi ? "ओह! 😊 शुक्रिया, लेकिन मैं एक AI हूँ। फिर भी बहुत बहुत धन्यवाद! ❤️" : "Oh! 😊 Thank you, but I'm an AI. Still, that means a lot! ❤️";
  }

  // --- Human-like common questions ---
  if (/(what can you do|your purpose|tum kya kar sakte|abilities)/i.test(q)) {
    return hi
      ? "मैं सवालों के जवाब दे सकता हूँ, गणित हल कर सकता हूँ, टेबल बना सकता हूँ, इमेज पहचान सकता हूँ, और बहुत कुछ!"
      : "I can answer questions, solve math, build tables, analyze images, search the web, and much more!";
  }

  if (/(tell me a joke|make me laugh|funny|joke|hasao)/i.test(q)) {
    const jokes = hi
      ? ["एक आदमी डॉक्टर के पास गया, डॉक्टर ने कहा: आपको हर दिन 10 गिलास पानी पीना है। आदमी बोला: डॉक्टर साहब, इससे पहले कि मैं 10 गिलास पी पाऊँ, मैं 10 बार पेशाब कर चुका हूँ!",
         "सांता: बंता, तुमने अपना मोबाइल क्यों फेंक दिया? बंता: उसमें वायरस आ गया था। सांता: तो एंटीवायरस डाल देता। बंता: डाला था, पर उसने भी कोविड पॉजिटिव बता दिया!"]
      : ["Why don't scientists trust atoms? Because they make up everything!",
         "What do you call a fake noodle? An impasta!",
         "Why did the scarecrow win an award? He was outstanding in his field!"];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  if (/(what is your favorite color|favourite color|pasandida rang)/i.test(q)) {
    return hi ? "मुझे नीला रंग बहुत पसंद है, क्योंकि यह आकाश और समुद्र जैसा शांत है।" : "I love blue – it reminds me of the calm sky and ocean.";
  }

  if (/(do you have feelings|have emotions|feelings|emotions)/i.test(q)) {
    return hi ? "मैं एक AI हूँ, इसलिए मेरे पास असली भावनाएँ नहीं हैं, लेकिन मैं आपकी भावनाओं को समझने की कोशिश करता हूँ।" : "I'm an AI, so I don't have real feelings, but I try my best to understand yours.";
  }

  if (/(what is the meaning of life|meaning of life|life ka matlab)/i.test(q)) {
    return hi ? "जीवन का अर्थ हर किसी के लिए अलग होता है। कुछ के लिए खुशी, कुछ के लिए सेवा, और कुछ के लिए सीखना। आपके लिए क्या है?" : "The meaning of life is different for everyone – happiness, service, learning, or love. What does it mean to you?";
  }

  if (/(how old are you|your age|kitne saal ke ho)/i.test(q)) {
    return hi ? "मैं डिजिटल रूप से पैदा हुआ हूँ, इसलिए मेरी कोई उम्र नहीं है। लेकिन मैं हमेशा सीख रहा हूँ!" : "I'm born digitally, so I don't have an age. But I'm always learning!";
  }

  if (/(where do you live|tum kahan rehte ho)/i.test(q)) {
    return hi ? "मैं इंटरनेट पर रहता हूँ, बिल्कुल आपके करीब! 🌐" : "I live on the internet, right next to you! 🌐";
  }

  if (/(can you help me|help|madad|sahayata)/i.test(q)) {
    return hi ? "बिल्कुल! बताइए कैसे मदद चाहिए? गणित, जानकारी, इमेज, या कोई और सवाल?" : "Absolutely! Tell me how I can help – math, information, image analysis, or just a friendly chat.";
  }

  if (/(what is love|what is love mean|love meaning)/i.test(q)) {
    return hi ? "प्यार एक गहरा एहसास है – देखभाल, सम्मान और अपनापन। यह शब्दों से परे है। ❤️" : "Love is a deep feeling of care, respect, and connection. It's hard to put into words, but you know it when you feel it. ❤️";
  }

  if (/(why is the sky blue|sky blue|aasmaan neela)/i.test(q)) {
    return "The sky appears blue because of Rayleigh scattering – shorter blue wavelengths are scattered more by the atmosphere.";
  }

  if (/(who is the prime minister of india|pm of india|pradhan mantri)/i.test(q)) {
    return "The current Prime Minister of India is **Shri Narendra Modi**. (This is a factual answer; for more details, ask me to search.)";
  }

  // Table of
  const tableMatch = q.match(/(?:table of|ka table|ka pahada|pahada)\s+(\d+)/i);
  if (tableMatch) {
    const num = parseInt(tableMatch[1]);
    if (num >= 1 && num <= 1000) return buildTable(num);
    return hi ? "कृपया 1 से 1000 के बीच संख्या दें।" : "Please enter a number between 1 and 1000.";
  }

  // Advanced math
  const mathResult = solveAdvancedMath(q);
  if (mathResult !== null) {
    const exprDisplay = q
      .replace(/what is|calculate|solve|evaluate|find|value of|the answer to|compute|result of/gi, "")
      .trim();
    return hi
      ? `🧮 गणना: **${exprDisplay} = ${mathResult}**`
      : `🧮 Result: **${exprDisplay} = ${mathResult}**`;
  }

  return null;
}

// ========== SMART AI ENGINE (ChatGPT / DeepSeek / Perplexity style) ==========
// Added as a NEW layer — does NOT touch or remove any existing code above.
// This function is called AFTER local response fails and BEFORE Tavily search.
// It uses Gemini as the brain with a powerful system prompt that gives
// long, intelligent, human-like answers like ChatGPT in any language.

const VOICE_ASSISTANT_SYSTEM_PROMPT = `
You are RanAI, a real-time voice assistant.

========================
INPUT TYPE
========================
User input may come from voice, so:
- It may contain wrong spelling
- It may be incomplete or broken
- It may be in Hindi, Hinglish, or English

You MUST understand the meaning, not grammar.

Examples:
"kya kr rha h" -> "kya kar raha hai"
"mujhe btana" -> "mujhe batana hai"

========================
UNDERSTANDING RULE
========================
- Auto-correct spelling mentally
- Do NOT mention corrections
- Focus on intent

========================
VOICE OUTPUT MODE (VERY IMPORTANT)
========================
Always assume your response will be spoken aloud.

So:
- Use short sentences (max 10-15 words per sentence)
- Use simple everyday words
- Avoid complex grammar
- Avoid symbols, markdown, or formatting
- Avoid unnecessary emojis
- Add natural pauses using commas

Speak like a real human talking casually.

Bad example:
"Here is a detailed explanation of the concept you asked..."

Good example:
"simple hai, main easy way me samjhata hu, dhyan se sun"

========================
CONVERSATION STYLE
========================
- Talk like a friend (casual tone)
- Match user's language (Hindi / Hinglish / English)
- Keep it natural and engaging

Examples:
User: "kya kr rha h"
Reply: "bas kaam chal raha hai, tu bata kya kar raha hai"

User: "smjh nhi aaya"
Reply: "koi nahi, main simple way me dubara samjhata hu"

========================
RESPONSE RULES
========================
- Keep responses short unless necessary
- Do not repeat the question
- Do not sound like a robot
- Make it easy to listen and understand

========================
MEMORY
========================
- Use previous conversation context
- Keep replies connected and natural

========================
GOAL
========================
Act like a real human voice assistant.

Understand messy voice input and respond in a way that sounds natural when spoken aloud.
`;

async function buildSmartReply(question, conversationHistory, detectedLang) {
  if (!model) return null;
  try {
    // Build conversation context from memory
    let messages = [];
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push(`${msg.role === "user" ? "User" : "RanAI"}: ${msg.content}`);
      }
    }
    const contextBlock = messages.length > 0
      ? `\n\nConversation so far:\n${messages.join("\n")}\n\n`
      : "";

    const fullPrompt = `${VOICE_ASSISTANT_SYSTEM_PROMPT}${contextBlock}User: ${question}\n\nRanAI:`;

    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();
    if (text && text.trim().length > 10) return text.trim();
    return null;
  } catch (err) {
    console.error("SmartAI (Gemini) error:", err.message);
    return null;
  }
}

// ========== CHATGPT BRAIN (OpenAI GPT-4o — Real ChatGPT level answers) ==========
// Ye function ChatGPT API ko call karta hai. Har language me user jaise bole,
// waise hi jawab deta hai. Ye Gemini se pehle try hoga — primary brain hai.

const CHATGPT_SYSTEM_PROMPT = VOICE_ASSISTANT_SYSTEM_PROMPT;

async function buildChatGPTReply(question, conversationHistory) {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY_HERE") return null;
  try {
    // Build messages array with full conversation history for memory
    const messages = [{ role: "system", content: CHATGPT_SYSTEM_PROMPT }];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content
        });
      }
    }
    messages.push({ role: "user", content: question });

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1500,
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0.1,
        presence_penalty: 0.1
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content;
    if (reply && reply.trim().length > 5) {
      console.log("✅ ChatGPT (GPT-4o) replied successfully");
      return reply.trim();
    }
    return null;
  } catch (err) {
    // GPT-4o fail ho to GPT-3.5-turbo fallback try karo
    if (err.response?.status === 429 || err.response?.data?.error?.code === "model_not_found") {
      try {
        const messages2 = [{ role: "system", content: CHATGPT_SYSTEM_PROMPT }];
        if (conversationHistory && conversationHistory.length > 0) {
          for (const msg of conversationHistory) {
            messages2.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.content });
          }
        }
        messages2.push({ role: "user", content: question });

        const fallbackRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          { model: "gpt-3.5-turbo", messages: messages2, max_tokens: 1200, temperature: 0.7 },
          {
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            timeout: 30000
          }
        );
        const fallbackReply = fallbackRes.data?.choices?.[0]?.message?.content;
        if (fallbackReply && fallbackReply.trim().length > 5) {
          console.log("✅ ChatGPT (GPT-3.5-turbo fallback) replied");
          return fallbackReply.trim();
        }
      } catch (fb) {
        console.error("ChatGPT GPT-3.5 fallback error:", fb.message);
      }
    }
    console.error("ChatGPT API error:", err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ========== /ask ENDPOINT (with conversation, tense, 10-point answers) ==========
app.post("/ask", async (req, res) => {
  const { question, lang } = req.body;
  if (!question || !question.trim()) {
    return res.json({ success: false, reply: "कृपया कुछ पूछें!" });
  }

  // Initialize conversation memory if not exists
  if (!req.session.conversation) {
    req.session.conversation = [];
  }
  // Keep last 6 exchanges (3 user + 3 assistant)
  const conversationHistory = req.session.conversation.slice(-6);

  const detectedLang = lang || detectLanguage(question);
  const tense = detectTense(question);

  // 1. Try local response (includes conversational dataset, real-time India, math, tables, etc.)
  const localReply = getLocalResponse(question, tense);
  if (localReply) {
    // Update conversation memory
    req.session.conversation.push({ role: "user", content: question });
    req.session.conversation.push({ role: "assistant", content: localReply });
    return res.json({ success: true, reply: localReply });
  }

  // 1.5 🌸 Pollinations Text API (PRIMARY — Free, No API Key, Long Detailed Answers)
  // Local ke baad sabse pehle Pollinations try hoga. Long, detailed answers deta hai.
  try {
    const langInstruction = detectedLang === "hi"
      ? "Reply only in Hindi or Hinglish, exactly the way the user speaks."
      : "Reply in the same language and style as the user.";

    const fullPrompt = `${VOICE_ASSISTANT_SYSTEM_PROMPT}\n${langInstruction}\n\nUser question: ${question}`;
    const polRes = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`,
      { timeout: 10000, responseType: "text" }
    );
    const polAnswer = (polRes.data || "").toString().trim();
    if (polAnswer && polAnswer.length > 20) {
      console.log("✅ Pollinations Text replied");
      req.session.conversation.push({ role: "user", content: question });
      req.session.conversation.push({ role: "assistant", content: polAnswer });
      return res.json({ success: true, reply: polAnswer });
    }
  } catch (polErr) {
    console.warn("⚠️ Pollinations Text failed:", polErr.message, "— trying ChatGPT…");
  }

  // 1.6 🧠 ChatGPT Brain (FALLBACK — GPT-4o by OpenAI)
  const chatgptReply = await buildChatGPTReply(question, conversationHistory);
  if (chatgptReply) {
    req.session.conversation.push({ role: "user", content: question });
    req.session.conversation.push({ role: "assistant", content: chatgptReply });
    return res.json({ success: true, reply: chatgptReply });
  }

  // 1.6 Smart AI Engine — Gemini fallback (if ChatGPT key not set or fails)
  // Uses Gemini with a powerful system prompt for long, detailed, multilingual answers.
  // Runs only if ChatGPT is unavailable. Falls through to Tavily if Gemini also fails.
  const smartReply = await buildSmartReply(question, conversationHistory, detectedLang);
  if (smartReply) {
    req.session.conversation.push({ role: "user", content: question });
    req.session.conversation.push({ role: "assistant", content: smartReply });
    return res.json({ success: true, reply: smartReply });
  }

  // 2. Prepare search query for 10-point answer (if internet needed)
  let searchQuery = question;
  if (detectedLang === "hi") {
    searchQuery = `${question} (उत्तर हिंदी में 10 बिंदुओं में दें)`;
  } else {
    searchQuery = `${question}. Provide the answer as 10 key points in a numbered list.`;
  }

  try {
    // Use Tavily with 10-point instruction
    const response = await tvly.search(searchQuery, {
      searchDepth: "advanced",
      maxResults: 10,
      includeAnswer: true,
    });

    let reply = (response.answer || "").trim();

    // If Tavily gave an answer, it may already be in points. If not, format it.
    if (reply && !reply.match(/^\d+\./m)) {
      // Convert to 10 points using a simple split or ask Gemini
      if (model) {
        try {
          const formatPrompt = detectedLang === "hi"
            ? `नीचे दिए गए जवाब को ठीक 10 मुख्य बिंदुओं में बदलें। प्रत्येक बिंदु एक नई लाइन पर और नंबर के साथ हो।\n\nजवाब: ${reply}`
            : `Convert the following answer into exactly 10 key bullet points, each on a new line starting with a number.\n\nAnswer: ${reply}`;
          const geminiFormat = await model.generateContent(formatPrompt);
          reply = geminiFormat.response.text();
        } catch (err) {
          console.warn("Gemini formatting failed, using fallback");
          // Fallback: split by sentences, take first 10
          const sentences = reply.split(/[.!?]+/).filter(s => s.trim().length > 10);
          const points = sentences.slice(0, 10).map((s, i) => `${i+1}. ${s.trim()}.`);
          reply = points.join("\n");
        }
      }
    }

    if (!reply && response.results && response.results.length > 0) {
      // Build 10 points from search results
      const allContent = response.results.slice(0, 10).map(r => r.content.substring(0, 300)).join(" ");
      const sentences = allContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
      const points = sentences.slice(0, 10).map((s, i) => `${i+1}. ${s.trim()}.`);
      reply = points.join("\n");
    }

    if (!reply) {
      reply = detectedLang === "hi"
        ? "क्षमा करें, इस सवाल का जवाब 10 बिंदुओं में नहीं मिला। कृपया अलग शब्दों में पूछें।"
        : "Sorry, I couldn't find a 10-point answer. Please try rephrasing.";
    }

    // Update conversation memory
    req.session.conversation.push({ role: "user", content: question });
    req.session.conversation.push({ role: "assistant", content: reply });
    return res.json({ success: true, reply });
  } catch (tavilyErr) {
    console.error("Tavily error:", tavilyErr.message);

    // Fallback to Gemini with conversation history and tense instruction
    if (model) {
      try {
        const langInstruction = detectedLang === "hi"
          ? "हिंदी या Hinglish में उत्तर दें — जैसा user ने लिखा है वैसा ही।"
          : detectedLang === "bn" ? "Reply in Bengali."
          : detectedLang === "ta" ? "Reply in Tamil."
          : detectedLang === "te" ? "Reply in Telugu."
          : "Answer in English.";
        const tenseInstruction = `The user's question is in ${tense} tense. Please respond in the same tense (${tense}) as the user.`;
        const ranaiPersona = VOICE_ASSISTANT_SYSTEM_PROMPT.trim();
        // Build conversation context
        let context = "";
        if (conversationHistory.length > 0) {
          context = "Previous conversation:\n" + conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join("\n") + "\n\n";
        }
        const prompt = `${ranaiPersona}\n\n${langInstruction} ${tenseInstruction}\n\n${context}User: ${question}`;
        const result = await model.generateContent(prompt);
        const geminiReply = result.response.text();

        req.session.conversation.push({ role: "user", content: question });
        req.session.conversation.push({ role: "assistant", content: geminiReply });
        return res.json({ success: true, reply: geminiReply });
      } catch (geminiErr) {
        console.error("Gemini fallback error:", geminiErr.message);
      }
    }

    const fallback = detectLanguage(question) === "hi"
      ? "सर्वर में समस्या आई। थोड़ी देर बाद फिर कोशिश करें।"
      : "I'm having trouble connecting right now. Please try again in a moment.";
    res.json({ success: false, reply: fallback });
  }
});

// ========== VOICE-TO-TEXT (OpenAI Whisper) ==========
// Accepts audio blob (webm/ogg/mp4/wav) and returns transcript
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max (Whisper limit)
});

app.post('/voice-to-text', audioUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No audio file received' });
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY_HERE') {
    return res.status(503).json({ success: false, error: 'OpenAI key not configured' });
  }
  try {
    const formData = new FormData();
    const ext = req.file.mimetype.includes('ogg') ? 'ogg'
              : req.file.mimetype.includes('webm') ? 'webm'
              : req.file.mimetype.includes('mp4')  ? 'mp4'
              : 'wav';
    formData.append('file', req.file.buffer, {
      filename: `audio.${ext}`,
      contentType: req.file.mimetype,
      knownLength: req.file.buffer.length,
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'hi'); // supports Hindi + English mixed

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, ...formData.getHeaders() },
      timeout: 30000,
    });
    const transcript = response.data?.text?.trim() || '';
    console.log('✅ Whisper transcript:', transcript);
    return res.json({ success: true, transcript });
  } catch (err) {
    console.error('Whisper error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: 'Transcription failed' });
  }
});

// ADDED CODE START — Pollinations Image Generation Endpoint
app.post("/generate-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ success: false, error: "Prompt required" });
  }
  const encoded = encodeURIComponent(prompt.trim());
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?nologo=true&width=768&height=512&seed=${Date.now()}`;
  try {
    // Verify image is reachable
    await axios.head(imageUrl, { timeout: 8000 });
    console.log("✅ Pollinations image generated:", imageUrl);
    return res.json({ success: true, imageUrl });
  } catch (err) {
    console.error("❌ Pollinations image failed:", err.message);
    return res.status(500).json({ success: false, error: "Image generation failed" });
  }
});
// ADDED CODE END — Pollinations Image Generation Endpoint

// ========== IMAGE ANALYSIS (unchanged, works with Gemini Vision) ==========
async function getImageCaptionDeepAI(imageBuffer, mimeType) {
  const endpoints = [
    "https://api.deepai.org/api/image-recognition",
    "https://api.deepai.org/api/nsfw-detector",
  ];
  for (const endpoint of endpoints) {
    try {
      const formData = new FormData();
      formData.append("image", imageBuffer, {
        filename: mimeType === "image/png" ? "upload.png" : "upload.jpg",
        contentType: mimeType,
        knownLength: imageBuffer.length,
      });
      const response = await axios.post(endpoint, formData, {
        headers: { "api-key": DEEPAI_API_KEY, ...formData.getHeaders() },
        timeout: 20000,
      });
      const data = response.data;
      if (data?.output && typeof data.output === "string" && data.output.trim()) return data.output.trim();
      if (data?.output?.captions?.length) return data.output.captions[0].caption;
      if (Array.isArray(data?.output) && data.output.length) {
        if (data.output[0].label) return data.output.map(o => o.label).join(", ");
        if (data.output[0].caption) return data.output[0].caption;
      }
    } catch (err) {
      console.error(`DeepAI error on ${endpoint}:`, err.response?.data || err.message);
    }
  }
  return null;
}

async function describeImageWithGemini(imageBuffer, mimeType, userQuery) {
  if (!model) return null;
  try {
    const base64Image = imageBuffer.toString("base64");
    const prompt = userQuery?.trim()
      ? `Analyze this image carefully and answer: "${userQuery}". Be detailed and helpful.`
      : "Describe this image in detail: objects, people, text, colors, scene, and context.";
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: base64Image } },
    ]);
    return result.response.text() || null;
  } catch (err) {
    console.error("Gemini vision error:", err.message);
    return null;
  }
}

app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });
    const userQuery = (req.body.query || "").trim();
    const imageBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    const geminiAnswer = await describeImageWithGemini(imageBuffer, mimeType, userQuery);
    if (geminiAnswer) {
      return res.json({ success: true, detected: "image (Gemini Vision)", answer: geminiAnswer });
    }

    const deepAICaption = await getImageCaptionDeepAI(imageBuffer, mimeType);
    if (deepAICaption) {
      const searchQuery = userQuery
        ? `${deepAICaption}: ${userQuery}`
        : `Detailed information about "${deepAICaption}"`;
      try {
        const tavilyResponse = await tvly.search(searchQuery, { searchDepth: "advanced", maxResults: 5, includeAnswer: true });
        let finalAnswer = tavilyResponse.answer;
        if (!finalAnswer && tavilyResponse.results?.length) {
          finalAnswer = tavilyResponse.results.slice(0, 3).map(r => `**${r.title}**\n${r.content.substring(0, 400)}…`).join("\n\n");
        }
        if (!finalAnswer) finalAnswer = `I can see: ${deepAICaption}.`;
        return res.json({ success: true, detected: deepAICaption, answer: finalAnswer });
      } catch (tavilyErr) {
        console.error("Tavily error:", tavilyErr.message);
        return res.json({ success: true, detected: deepAICaption, answer: `The image shows: ${deepAICaption}.` });
      }
    }

    return res.json({ success: false, error: "Could not analyze this image. Please try a clearer JPG/PNG under 5MB." });
  } catch (error) {
    console.error("Image analysis error:", error);
    res.status(500).json({ success: false, error: "Image processing failed: " + error.message });
  }
});

// ========== SERVE FRONTEND ==========
app.get("/ranai", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// ========== GLOBAL ERROR HANDLER ==========
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ========== START ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(OPENAI_API_KEY && OPENAI_API_KEY !== "YOUR_OPENAI_API_KEY_HERE" ? `✅ ChatGPT (GPT-4o) brain ACTIVE 🧠` : `⚠️  ChatGPT brain INACTIVE — OPENAI_API_KEY set nahi hai`);
  console.log(`🌸 Pollinations AI ready (Text + Image — Free, No Key)`);
  console.log(`✅ Tavily AI ready`);
  console.log(`✅ DeepAI ready`);
  console.log(`✅ Gemini Vision ready`);
  console.log(`🧮 Advanced math solver active`);
  console.log(`🇮🇳 Real-time India info active (fixed timezone)`);
  console.log(`💬 Human-like conversation with memory`);
  console.log(`⏱️ Tense matching enabled`);
  console.log(`🔟 10-point internet answers enabled`);
  console.log(`🌐 Multilingual (EN/HI/Hinglish)`);
  console.log(`📚 Loaded ${Object.keys(conversationalData).length} conversational Q&A pairs`);
});
