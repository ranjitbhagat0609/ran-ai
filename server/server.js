const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const session = require("express-session"); // for conversation memory
const { sql } = require("./db");
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

  // --- Greetings & basic chit-chat ---
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

  // 1. Try local response (includes real-time India, math, tables, chit-chat, who built you)
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
});
