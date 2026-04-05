const express = require("express");
const cors = require("cors");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));

// Session memory (in‑memory, no database)
app.use(
  session({
    secret: "ranai-secret-key-change-in-production",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 60 * 1000 }, // 30 minutes
  })
);

// ========== API KEY ==========
const GEMINI_API_KEY = "AIzaSyA8t4ehEcTCz14tuI6DLSznGNRvWqzKj7Y";

// ========== GEMINI SETUP ==========
let model = null;
try {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  console.log("✅ Gemini AI ready (chat + vision)");
} catch (err) {
  console.warn("⚠️ Gemini not available:", err.message);
}

// ========== MULTER (for image upload) ==========
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only .jpeg, .jpg, .png formats allowed"), false);
  },
});

// ========== HELPERS ==========
function detectLanguage(text) {
  const t = text.trim();
  if (/[\u0900-\u097F]/.test(t)) return "hi";
  if (/\b(namaste|kaise ho|kya haal|accha|theek|shukriya)\b/i.test(t)) return "hi";
  return "en";
}

function detectTense(question) {
  const q = question.toLowerCase();
  if (/\b(did|was|were|had|yesterday|last night|ago)\b/.test(q) || /\b(\w+ed)\b/.test(q))
    return "past";
  if (/\b(will|shall|going to|tomorrow|next|soon)\b/.test(q)) return "future";
  return "present";
}

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
  return { formatted, timezone: "Indian Standard Time (IST), UTC+5:30" };
}

function solveAdvancedMath(input) {
  let expr = input
    .replace(/what is|calculate|solve|find|value of/gi, "")
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b|\bmultiplied by\b/gi, "*")
    .replace(/\bdivided by\b/gi, "/")
    .replace(/\bto the power of\b/gi, "**")
    .replace(/\^/g, "**")
    .replace(/\bsqrt\b/gi, "Math.sqrt")
    .replace(/\bpi\b/gi, "Math.PI")
    .trim();
  if (!/^[\d\s+\-*/().%**]+$/.test(expr)) return null;
  try {
    const result = Function('"use strict"; return (' + expr + ")")();
    if (typeof result === "number" && isFinite(result)) return parseFloat(result.toFixed(8));
  } catch (_) {}
  return null;
}

function buildTable(num) {
  const rows = [];
  for (let i = 1; i <= 10; i++) rows.push(`${num} × ${i} = ${num * i}`);
  return `📊 **Table of ${num}**\n` + rows.join("\n");
}

function cleanInput(text) {
  const typos = {
    yuo: "you", u: "you", teh: "the", dont: "don't", cuz: "because",
    wanna: "want to", gonna: "going to", kinda: "kind of", outta: "out of",
    gotcha: "got you", ttyl: "talk to you later", brb: "be right back",
    mje: "mujhe", ni: "nahi", kon: "kaun", bnaya: "banaya", btao: "batao"
  };
  let cleaned = text.toLowerCase().trim();
  for (const [typo, correct] of Object.entries(typos))
    cleaned = cleaned.replace(new RegExp(`\\b${typo}\\b`, "gi"), correct);
  return cleaned;
}

function getLocalResponse(question, tense) {
  const q = cleanInput(question);
  const hi = detectLanguage(question) === "hi";

  // India time
  if (/(india time|current time in india|ist time|bharat ka samay)/i.test(q)) {
    const { formatted, timezone } = getIndiaRealTime();
    return hi ? `🇮🇳 **भारत का समय**\n📅 ${formatted}\n🌍 ${timezone}` : `🇮🇳 **India Time**\n📅 ${formatted}\n🌍 ${timezone}`;
  }
  // Who built you
  if (/(who (made|created|built) you|kisne banaya|kon banaya)/i.test(q))
    return hi ? "मुझे **R@njit** ने बनाया है! 😊" : "I was created by **R@njit**! 😊";
  // Greetings
  if (/^(hi|hello|hey|namaste|hola|yo)\b/i.test(q))
    return hi ? "नमस्ते! 😊 मैं RanAI हूँ।" : "Hello! 😊 I'm RanAI.";
  if (/(how are you|kaise ho|kya haal)/i.test(q))
    return hi ? "बिल्कुल ठीक हूँ! आप कैसे हैं? 😊" : "I'm great, thanks! How about you? 😊";
  if (/(thank|shukriya|dhanyavad)/i.test(q))
    return hi ? "आपका स्वागत है! 😊" : "You're welcome! 😊";
  // Joke
  if (/(tell me a joke|make me laugh|joke)/i.test(q)) {
    const jokes = ["Why don't scientists trust atoms? They make up everything!", "What do you call a fake noodle? An impasta!", "Why did the scarecrow win an award? He was outstanding in his field!"];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }
  // Table
  const tableMatch = q.match(/(?:table of|ka table|pahada)\s+(\d+)/i);
  if (tableMatch) return buildTable(parseInt(tableMatch[1]));
  // Math
  const mathResult = solveAdvancedMath(q);
  if (mathResult !== null) return `🧮 Result: **${mathResult}**`;

  return null;
}

// ========== CHAT ENDPOINT ==========
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim())
    return res.json({ success: false, reply: "Please ask something!" });

  if (!req.session.conversation) req.session.conversation = [];
  const history = req.session.conversation.slice(-6);
  const tense = detectTense(question);
  const lang = detectLanguage(question);

  // 1. Try local response
  const localReply = getLocalResponse(question, tense);
  if (localReply) {
    req.session.conversation.push({ role: "user", content: question });
    req.session.conversation.push({ role: "assistant", content: localReply });
    return res.json({ success: true, reply: localReply });
  }

  // 2. Fallback to Gemini
  if (!model) {
    return res.json({ success: false, reply: "AI model not available." });
  }

  try {
    const langInstruction = lang === "hi" ? "हिंदी में उत्तर दें।" : "Answer in English.";
    const tenseInstruction = `Respond in ${tense} tense.`;
    let context = "";
    if (history.length) {
      context = "Previous conversation:\n" + history.map(m => `${m.role}: ${m.content}`).join("\n") + "\n\n";
    }
    const prompt = `${context}You are RanAI, a friendly assistant. ${langInstruction} ${tenseInstruction}\nUser: ${question}`;
    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    req.session.conversation.push({ role: "user", content: question });
    req.session.conversation.push({ role: "assistant", content: reply });
    res.json({ success: true, reply });
  } catch (err) {
    console.error("Gemini error:", err);
    res.json({ success: false, reply: "Sorry, something went wrong. Please try again." });
  }
});

// ========== IMAGE ANALYSIS (Gemini Vision only) ==========
app.post("/analyze", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });
  if (!model) return res.status(500).json({ success: false, error: "Gemini not available" });

  const userQuery = req.body.query?.trim() || "Describe this image in detail.";
  try {
    const base64Image = req.file.buffer.toString("base64");
    const result = await model.generateContent([
      { text: userQuery },
      { inlineData: { mimeType: req.file.mimetype, data: base64Image } },
    ]);
    const answer = result.response.text();
    res.json({ success: true, answer });
  } catch (err) {
    console.error("Image analysis error:", err);
    res.status(500).json({ success: false, error: "Image analysis failed." });
  }
});

// ========== SERVE FRONTEND ==========
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 RanAI backend running on port ${PORT}`);
  console.log(`✅ Gemini ready | No database | No Tavily`);
});
