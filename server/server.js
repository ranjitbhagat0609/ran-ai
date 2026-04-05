const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const { supabase, sql } = require("./db"); // ← changed from 'db'
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { tavily } = require("@tavily/core");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));

// ========== SESSION & JWT ==========
app.use(session({
  secret: "ranai_super_secret_123",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }   // set true if using HTTPS in production
}));
app.use(passport.initialize());
app.use(passport.session());

const JWT_SECRET = "ranai_jwt_secret_456";

// ========== DATABASE SCHEMA (PostgreSQL) ==========
const initDB = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        google_id VARCHAR(255),
        picture TEXT,
        name VARCHAR(255),
        profile_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("✅ Users table ready (PostgreSQL)");
  } catch (err) {
    console.error("❌ Table creation error:", err);
  }
};
initDB();

// ========== API KEYS (move to env in production) ==========
const GEMINI_API_KEY = "AIzaSyA8t4ehEcTCz14tuI6DLSznGNRvWqzKj7Y";
const TAVILY_API_KEY = "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";
const DEEPAI_API_KEY = "d69c64d0-d7dd-4670-999b-3121add422d4";

// ========== AI SETUP ==========
let model = null;
try {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  console.log("✅ Gemini AI ready (vision supported)");
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

// ========== GOOGLE OAUTH STRATEGY ==========
passport.use(new GoogleStrategy({
    clientID: "782928190840-5fgohc0a790f048oe06n8nu0rtb8n27r.apps.googleusercontent.com",
    clientSecret: "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",
    callbackURL: "https://ran-ai.onrender.com/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const googleId = profile.id;
      const picture = profile.photos[0]?.value || "";
      const name = profile.displayName;

      const existing = await sql`SELECT * FROM users WHERE email = ${email}`;
      if (existing.length === 0) {
        const inserted = await sql`
          INSERT INTO users (email, google_id, picture, name, profile_completed)
          VALUES (${email}, ${googleId}, ${picture}, ${name}, false)
          RETURNING id, email, name, picture, profile_completed
        `;
        const newUser = inserted[0];
        return done(null, newUser);
      } else {
        const user = existing[0];
        if (!user.google_id || user.picture !== picture) {
          await sql`
            UPDATE users SET google_id = ${googleId}, picture = ${picture}
            WHERE email = ${email}
          `;
        }
        return done(null, {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          profile_completed: user.profile_completed
        });
      }
    } catch (error) {
      return done(error);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await sql`
      SELECT id, email, name, picture, profile_completed FROM users WHERE id = ${id}
    `;
    done(null, result[0] || null);
  } catch (err) {
    done(err, null);
  }
});

// ========== AUTH ROUTES ==========
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign(
      {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        profile_completed: req.user.profile_completed
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.redirect(`/?token=${token}`);
  }
);

app.get("/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: "No token" });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const results = await sql`
      SELECT id, email, name, picture, profile_completed FROM users WHERE id = ${decoded.id}
    `;
    if (results.length === 0) return res.status(401).json({ success: false });
    res.json({ success: true, user: results[0] });
  } catch (err) {
    res.status(401).json({ success: false });
  }
});

app.post("/complete-profile", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { name } = req.body;
    if (!name || name.trim() === "") {
      return res.json({ success: false, message: "Name is required" });
    }
    const updated = await sql`
      UPDATE users SET name = ${name.trim()}, profile_completed = true
      WHERE id = ${decoded.id}
      RETURNING id, email, name, picture, profile_completed
    `;
    if (updated.length === 0) throw new Error("Update failed");
    const newToken = jwt.sign(
      { id: decoded.id, email: decoded.email, name: name.trim(), profile_completed: true },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ success: true, token: newToken, user: updated[0] });
  } catch (err) {
    res.status(401).json({ success: false });
  }
});

app.post("/logout", (req, res) => {
  req.logout(() => {});
  res.json({ success: true });
});

// ========== LANGUAGE DETECTION ==========
function detectLanguage(text) {
  const t = text.trim();
  if (/[\u0900-\u097F]/.test(t)) return "hi";
  if (/\b(namaste|kaise ho|kya haal|kya chal|thik ho|bahut|mujhe|aap|main|kya baat|btao|shukriya|dhanyawad|nahi|kyun|kab|kahan|kaun|mera|tera|hum|tum|yeh|woh|bhai|dost|accha|theek|bilkul|zaroor)\b/i.test(t))
    return "hi";
  return "en";
}

// ========== MATH ENGINE ==========
function solveMath(input) {
  let expr = input
    .replace(/what is|calculate|solve|evaluate|find|value of|the answer to|compute|result of/gi, "")
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b|\bmultiplied by\b/gi, "*")
    .replace(/\bdivided by\b/gi, "/")
    .replace(/\bmod\b/gi, "%")
    .replace(/\bto the power of\b|\bpow\b/gi, "**")
    .replace(/\^/g, "**")
    .replace(/[,،]/g, "")
    .trim();

  if (!/^[\d\s+\-*/().%**\[\]]+$/.test(expr)) return null;
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

// ========== LOCAL RESPONSE HANDLER ==========
function cleanInput(text) {
  const typoMap = {
    "mje": "mujhe", "muje": "mujhe", "ni": "nahi", "nhi": "nahi", "nai": "nahi",
    "kon": "kaun", "bnaya": "banaya", "mra": "mera", "kr rha": "kar raha",
    "kr rhe": "kar rahe", "btao": "batao", "kya kr rhe": "kya kar rahe ho",
  };
  let cleaned = text.toLowerCase().trim();
  for (const [typo, correct] of Object.entries(typoMap)) {
    cleaned = cleaned.replace(new RegExp(`\\b${typo}\\b`, "gi"), correct);
  }
  return cleaned;
}

function getLocalResponse(question) {
  const q    = cleanInput(question);
  const lang = detectLanguage(question);
  const hi   = lang === "hi";

  if (/^(hi|hello|hey|namaste|hlo|hii|hola|sup|yo)\b/i.test(q)) {
    return hi ? "नमस्ते! 😊 मैं RanAI हूँ। कोई सवाल पूछिए?" : "Hello! 😊 I'm RanAI. How can I help you today?";
  }
  if (/(what is your name|your name|tumhara naam|aapka naam|who are you|kon ho)/i.test(q)) {
    return hi ? "मेरा नाम RanAI है। मैं एक AI सहायक हूँ।" : "My name is RanAI. I'm an AI assistant.";
  }
  if (/(who (made|created|built) you|tumko kisne banaya|kisne banaya)/i.test(q)) {
    return hi ? "मुझे **R@njit** ने बनाया है। वो एक शानदार डेवलपर हैं! 😊" : "I was created by **R@njit**, a brilliant developer! 😊";
  }
  if (/(how are you|kaise ho|kya haal|kya chal)/i.test(q)) {
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
  if (/(what can you do|your purpose|tum kya kar sakte)/i.test(q)) {
    return hi
      ? "मैं सवालों के जवाब दे सकता हूँ, गणित हल कर सकता हूँ, टेबल बना सकता हूँ, इमेज पहचान सकता हूँ, और बहुत कुछ!"
      : "I can answer questions, solve math, build tables, analyze images, search the web, and much more!";
  }

  const tableMatch = q.match(/(?:table of|ka table|ka pahada|pahada)\s+(\d+)/i);
  if (tableMatch) {
    const num = parseInt(tableMatch[1]);
    if (num >= 1 && num <= 1000) return buildTable(num);
    return hi ? "कृपया 1 से 1000 के बीच संख्या दें।" : "Please enter a number between 1 and 1000.";
  }

  const mathResult = solveMath(q);
  if (mathResult !== null) {
    const exprDisplay = q
      .replace(/what is|calculate|solve|evaluate|find|value of|the answer to|compute|result of/gi, "")
      .trim();
    return hi
      ? `🧮 गणना: **${exprDisplay} = ${mathResult}**`
      : `🧮 Result: **${exprDisplay} = ${mathResult}**`;
  }

  let m;
  m = q.match(/(\d+(?:\.\d+)?)\s*(?:\+|plus)\s*(\d+(?:\.\d+)?)/i);
  if (m) { const r = parseFloat(m[1]) + parseFloat(m[2]); return `${m[1]} + ${m[2]} = **${r}**`; }
  m = q.match(/(\d+(?:\.\d+)?)\s*(?:-|minus)\s*(\d+(?:\.\d+)?)/i);
  if (m) { const r = parseFloat(m[1]) - parseFloat(m[2]); return `${m[1]} - ${m[2]} = **${r}**`; }
  m = q.match(/(\d+(?:\.\d+)?)\s*(?:\*|x|times|×)\s*(\d+(?:\.\d+)?)/i);
  if (m) { const r = parseFloat(m[1]) * parseFloat(m[2]); return `${m[1]} × ${m[2]} = **${r}**`; }
  m = q.match(/(\d+(?:\.\d+)?)\s*(?:\/|÷|divided by)\s*(\d+(?:\.\d+)?)/i);
  if (m) {
    const b = parseFloat(m[2]);
    if (b === 0) return hi ? "शून्य से भाग नहीं हो सकता।" : "Cannot divide by zero.";
    const r = parseFloat(m[1]) / b;
    return `${m[1]} ÷ ${m[2]} = **${parseFloat(r.toFixed(8))}**`;
  }

  return null;
}

// ========== /ask ENDPOINT ==========
app.post("/ask", async (req, res) => {
  const { question, lang } = req.body;
  if (!question || !question.trim()) {
    return res.json({ success: false, reply: "कृपया कुछ पूछें!" });
  }

  const localReply = getLocalResponse(question);
  if (localReply) return res.json({ success: true, reply: localReply });

  const detectedLang = lang || detectLanguage(question);
  const searchQuery = detectedLang === "hi"
    ? `${question} (respond in Hindi)`
    : question;

  try {
    const response = await tvly.search(searchQuery, {
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: true,
    });

    let reply = (response.answer || "").trim();

    if (!reply && response.results && response.results.length > 0) {
      reply = response.results
        .slice(0, 3)
        .map(r => `• **${r.title}**\n  ${r.content.substring(0, 200)}…`)
        .join("\n\n");
    }

    if (!reply) {
      reply = detectedLang === "hi"
        ? "क्षमा करें, इस सवाल का जवाब नहीं मिला। कृपया अलग शब्दों में पूछें।"
        : "Sorry, I couldn't find an answer. Please try rephrasing your question.";
    }

    return res.json({ success: true, reply });
  } catch (tavilyErr) {
    console.error("Tavily error:", tavilyErr.message);

    if (model) {
      try {
        const langInstruction = detectedLang === "hi" ? "Please reply in Hindi." : "Please reply in English.";
        const result = await model.generateContent(
          `Answer this question concisely and helpfully. ${langInstruction}\n\nQuestion: "${question}"`
        );
        return res.json({ success: true, reply: result.response.text() });
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

// ========== IMAGE ANALYSIS ==========
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
    const userQuery  = (req.body.query || "").trim();
    const imageBuffer = req.file.buffer;
    const mimeType   = req.file.mimetype;

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
  console.log(`🔐 Google OAuth enabled | JWT auth active`);
  console.log(`🧮 Math solver active | 🌐 Multilingual (EN/HI/Hinglish)`);
});
