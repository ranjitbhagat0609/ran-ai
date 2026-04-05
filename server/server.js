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

// ========== API KEYS ==========
const GEMINI_API_KEY = "AIzaSyA8t4ehEcTCz14tuI6DLSznGNRvWqzKj7Y";
const TAVILY_API_KEY = "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";
const DEEPAI_API_KEY = "d69c64d0-d7dd-4670-999b-3121add422d4";

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

// ========== LANGUAGE DETECTION ==========
function detectLanguage(text) {
  const t = text.trim();
  if (/[\u0900-\u097F]/.test(t)) return "hi";
  if (
    /\b(namaste|kaise ho|kya haal|kya chal|thik ho|bahut|mujhe|aap|main|kya baat|btao|shukriya|dhanyawad|nahi|kyun|kab|kahan|kaun|mera|tera|hum|tum|yeh|woh|bhai|dost|accha|theek|bilkul|zaroor)\b/i.test(
      t
    )
  )
    return "hi";
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

"mai weak feel kar raha": "Tum weak nahi ho 💪 bas hurt ho",
"i feel weak": "You're not weak 💪 just hurt",
"good morning": "Good morning ☀️ aaj ka din awesome banate hain 😊",
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
  "are you busy": "Never too busy for you.",
  "can you keep a secret": "I don't share your conversations – your privacy matters.",
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
        const langInstruction = detectedLang === "hi" ? "हिंदी में उत्तर दें।" : "Answer in English.";
        const tenseInstruction = `The user's question is in ${tense} tense. Please respond in the same tense (${tense}) as the user.`;
        // Build conversation context
        let context = "";
        if (conversationHistory.length > 0) {
          context = "Previous conversation:\n" + conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join("\n") + "\n\n";
        }
        const prompt = `${context}You are RanAI, a friendly, human-like assistant. ${langInstruction} ${tenseInstruction} Answer the following question concisely and helpfully.\n\nUser: ${question}`;
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
