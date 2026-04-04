const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const nodemailer = require("nodemailer");
const db = require("./db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { tavily } = require("@tavily/core");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client")));

// ========== API KEYS ==========
const GEMINI_API_KEY = "AIzaSyA8t4ehEcTCz14tuI6DLSznGNRvWqzKj7Y";
const TAVILY_API_KEY = "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";
const DEEPAI_API_KEY = "d69c64d0-d7dd-4670-999b-3121add422d4";

const tvly = tavily({ apiKey: TAVILY_API_KEY });

let model = null;
try {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  console.log("✅ Gemini AI ready (vision supported)");
} catch (err) {
  console.log("⚠️ Gemini not available:", err.message);
}

// ========== NODEMAILER (Gmail) ==========
const EMAIL_USER = "ranjiitbhagat31082003@gmail.com";
const EMAIL_PASS = "ihqakikvyuimcluu";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

// ========== MULTER ==========
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only .jpeg, .jpg, .png formats allowed"), false);
  },
});

// ========== OTP STORAGE ==========
let otpStore = {};
let verifiedUsers = {};

// ========== SEND OTP VIA EMAIL ==========
app.post("/send-otp", async (req, res) => {
  let { email } = req.body;
  if (!email) return res.json({ success: false, message: "Email required ❌" });
  email = email.toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.json({ success: false, message: "Invalid Email ❌" });
  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[email] = otp;
  const mailOptions = {
    from: EMAIL_USER,
    to: email,
    subject: "Your RanAI OTP Code",
    html: `<div style="font-family:Arial;max-width:500px;margin:auto;padding:20px;border:1px solid #ddd;border-radius:10px;">
      <h2 style="color:#10a37f;">RanAI Verification</h2>
      <p>Your OTP for signup is:</p>
      <div style="font-size:32px;font-weight:bold;color:#10a37f;margin:20px 0;">${otp}</div>
      <p>Valid for 10 minutes.</p>
      <hr><p style="font-size:12px;color:#888;">Ignore if not requested.</p></div>`,
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 OTP sent to ${email}: ${otp}`);
    res.json({ success: true, message: "OTP sent to your email 📧" });
  } catch (err) {
    console.error("Email send error:", err);
    res.json({ success: false, message: "Failed to send OTP. Check email configuration." });
  }
});

app.post("/verify-otp", (req, res) => {
  let { email, otp } = req.body;
  if (!email || !otp) return res.json({ success: false, message: "Missing data ❌" });
  email = email.toLowerCase();
  if (!otpStore[email]) return res.json({ success: false, message: "OTP not found or expired ❌" });
  if (String(otpStore[email]) === String(otp)) {
    verifiedUsers[email] = true;
    delete otpStore[email];
    return res.json({ success: true, message: "OTP verified ✅" });
  }
  res.json({ success: false, message: "Wrong OTP ❌" });
});

app.post("/signup", async (req, res) => {
  try {
    let { email, password, firstName, lastName } = req.body;
    if (!email || !password || !firstName || !lastName)
      return res.json({ success: false, message: "All fields required ❌" });
    email = email.toLowerCase();
    if (!verifiedUsers[email]) return res.json({ success: false, message: "Verify OTP first ❌" });
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passRegex.test(password)) return res.json({ success: false, message: "Password must be strong ❌" });
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
      "INSERT INTO users (email, password, is_verified, first_name, last_name) VALUES (?, ?, ?, ?, ?)",
      [email, hashedPassword, true, firstName, lastName],
      (err) => {
        if (err) {
          console.error("DB Error:", err);
          return res.json({ success: false, message: "User already exists or DB error ❌" });
        }
        delete verifiedUsers[email];
        res.json({ success: true, message: "Signup successful 🎉" });
      }
    );
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Server error ❌" });
  }
});

// ========== LOGIN ENDPOINT (ADDED) ==========
app.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) {
      return res.json({ success: false, message: "Email and password required ❌" });
    }
    email = email.toLowerCase();

    db.query(
      "SELECT id, email, password, first_name, last_name FROM users WHERE email = ?",
      [email],
      async (err, results) => {
        if (err || results.length === 0) {
          return res.json({ success: false, message: "Invalid credentials ❌" });
        }
        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
          return res.json({ success: false, message: "Invalid credentials ❌" });
        }
        // Login successful
        res.json({
          success: true,
          message: "Login successful 🎉",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
          },
        });
      }
    );
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Server error ❌" });
  }
});

// ========== LOCAL RESPONSE HANDLER ==========
function detectLanguage(text) {
  const t = text.trim();
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  if (/(?:namaste|kaise ho|kya haal|kya chal|thik ho|bahut|mujhe|aap|main|kya baat|baj r|kr r|kar rahe|btao|india|ke bare|ke baare|pm|shukriya)/i.test(t)) return 'hi';
  return 'en';
}

function evaluateMath(expr) {
  try {
    let sanitized = expr.replace(/\s/g, '').replace(/\^/g, '**');
    if (!/^[\d+\-*/().%**]+$/.test(sanitized)) return null;
    const result = Function('"use strict"; return (' + sanitized + ')')();
    if (typeof result === 'number' && isFinite(result)) return result;
    return null;
  } catch (e) {
    return null;
  }
}

function getLocalResponse(question) {
  const q = question.toLowerCase().trim();
  const lang = detectLanguage(question);
  const hi = lang === 'hi';

  // 1. Greetings
  if (/^(hi|hello|hey|namaste|hlo|hii|hola|sup|yo)/i.test(q)) {
    if (hi) return "नमस्ते! 😊 मेरा नाम RanAi है। आपसे मिलकर खुशी हुई। कोई सवाल पूछिए?";
    else return "Hello! 😊 I'm RanAi. Nice to meet you. How can I help?";
  }

  // 2. Ask name
  if (/(what is your name|your name|tumhara naam kya|aapka naam|who are you)/i.test(q)) {
    if (hi) return "मेरा नाम RanAi है। मैं एक AI सहायक हूँ।";
    else return "My name is RanAi. I'm an AI assistant.";
  }

  // 3. Who created you?
  if (/(who (made|created|built) you|tumko kisne banaya|aapko kisne banaya|your creator)/i.test(q)) {
    if (hi) return "मुझे **R@njit** ने बनाया है। वह एक शानदार डेवलपर हैं! 😊";
    else return "I was created by **R@njit**, a brilliant developer! 😊";
  }

  // 4. I love you
  if (/(i love you|love you|main tumse pyar karta|i <3 you)/i.test(q)) {
    if (hi) return "ओह! 😊 शुक्रिया, लेकिन मैं तो एक AI हूँ। फिर भी, आपका प्यार मेरे लिए बहुत मायने रखता है! ❤️";
    else return "Oh! 😊 Thank you, but I'm just an AI. Still, your love means a lot! ❤️";
  }

  // 5. Table of a number
  let tableMatch = q.match(/(?:table of|ka table|ka pahada|table)\s+(\d+)/i);
  if (tableMatch) {
    let num = parseInt(tableMatch[1]);
    if (num >= 1 && num <= 1000) {
      let lines = [];
      for (let i = 1; i <= 10; i++) lines.push(`${num} × ${i} = ${num * i}`);
      return `📊 **Table of ${num}**\n` + lines.join("\n");
    } else {
      return hi ? "कृपया 1 से 1000 के बीच की संख्या दें।" : "Please enter a number between 1 and 1000.";
    }
  }

  // 6. Numbers from 1 to N
  let rangeMatch = q.match(/(?:numbers?|1 to|from 1 to)\s*(\d+)/i);
  if (rangeMatch) {
    let max = parseInt(rangeMatch[1]);
    if (max >= 1 && max <= 1000) {
      let nums = [];
      for (let i = 1; i <= max; i++) nums.push(i);
      if (nums.length > 20) {
        return hi ? `1 से ${max} तक की संख्याएँ (केवल पहली 20 दिखा रहा हूँ):\n${nums.slice(0,20).join(", ")} ...` 
                  : `Numbers from 1 to ${max} (showing first 20):\n${nums.slice(0,20).join(", ")} ...`;
      } else {
        return hi ? `1 से ${max} तक की संख्याएँ:\n${nums.join(", ")}` 
                  : `Numbers from 1 to ${max}:\n${nums.join(", ")}`;
      }
    } else {
      return hi ? "कृपया 1 से 1000 के बीच की अधिकतम संख्या दें।" : "Please enter a maximum number between 1 and 1000.";
    }
  }

  // 7. Math expression evaluation
  let mathExpr = q.replace(/(what is|calculate|solve|evaluate|find|value of|the answer to)/gi, '').trim();
  if (mathExpr.match(/^[\d\s\+\-\*\/\(\)\.\^%]+$/)) {
    const result = evaluateMath(mathExpr);
    if (result !== null) {
      if (hi) return `गणना का परिणाम: ${mathExpr} = ${result}`;
      else return `Result: ${mathExpr} = ${result}`;
    }
  }

  // Explicit operations
  let opMatch = q.match(/(\d+)\s*\+\s*(\d+)/);
  if (opMatch) {
    let a = parseInt(opMatch[1]), b = parseInt(opMatch[2]);
    if (hi) return `${a} + ${b} = ${a+b}`;
    else return `${a} + ${b} = ${a+b}`;
  }
  opMatch = q.match(/(\d+)\s*-\s*(\d+)/);
  if (opMatch) {
    let a = parseInt(opMatch[1]), b = parseInt(opMatch[2]);
    if (hi) return `${a} - ${b} = ${a-b}`;
    else return `${a} - ${b} = ${a-b}`;
  }
  opMatch = q.match(/(\d+)\s*\*\s*(\d+)/);
  if (opMatch) {
    let a = parseInt(opMatch[1]), b = parseInt(opMatch[2]);
    if (hi) return `${a} × ${b} = ${a*b}`;
    else return `${a} × ${b} = ${a*b}`;
  }
  opMatch = q.match(/(\d+)\s*\/\s*(\d+)/);
  if (opMatch) {
    let a = parseInt(opMatch[1]), b = parseInt(opMatch[2]);
    if (b === 0) return hi ? "शून्य से भाग नहीं कर सकते।" : "Cannot divide by zero.";
    if (hi) return `${a} ÷ ${b} = ${a/b}`;
    else return `${a} ÷ ${b} = ${a/b}`;
  }

  // Chit-chat
  if (/(how are you|kaise ho|kya haal)/i.test(q)) {
    if (hi) return "मैं बिल्कुल ठीक हूँ, शुक्रिया! आप कैसे हैं? 😊";
    else return "I'm doing great, thanks! How about you? 😊";
  }
  if (/(thank you|thanks|shukriya|dhanyavaad)/i.test(q)) {
    if (hi) return "आपका स्वागत है! 😊 कभी भी पूछ सकते हैं।";
    else return "You're welcome! 😊 Happy to help anytime.";
  }
  if (/(good morning|gm|suprabhat)/i.test(q)) {
    if (hi) return "सुप्रभात! ☀️ आपका दिन शुभ हो।";
    else return "Good morning! ☀️ Have a wonderful day.";
  }
  if (/(good night|gn|shubh ratri)/i.test(q)) {
    if (hi) return "शुभ रात्रि! 🌙 अच्छी नींद लें।";
    else return "Good night! 🌙 Sleep well.";
  }
  if (/(what can you do|your purpose|tum kya kar sakte ho)/i.test(q)) {
    if (hi) return "मैं सवालों के जवाब दे सकता हूँ, गणित हल कर सकता हूँ, टेबल बना सकता हूँ, इमेज पहचान सकता हूँ, और बहुत कुछ!";
    else return "I can answer questions, solve math, generate tables, analyze images, and much more!";
  }

  return null;
}

// ========== /ask ENDPOINT (with local responses) ==========
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  if (!question || question.trim() === "") {
    return res.json({ success: false, reply: "कृपया कुछ पूछें!" });
  }

  const localReply = getLocalResponse(question);
  if (localReply) {
    return res.json({ success: true, reply: localReply });
  }

  try {
    const response = await tvly.search(question, {
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: true,
    });
    let reply = response.answer;
    if (!reply || reply.trim() === "") {
      if (response.results && response.results.length > 0) {
        reply = `🔍 कुछ जानकारी मिली:\n\n${response.results.map(r => `• ${r.title}\n  ${r.content.substring(0, 200)}...`).join("\n\n")}`;
      } else {
        reply = "क्षमा करें, मुझे इस सवाल का जवाब नहीं मिला। कृपया दूसरे शब्दों में पूछें।";
      }
    }
    res.json({ success: true, reply });
  } catch (error) {
    console.error("Tavily error:", error);
    if (model) {
      try {
        const result = await model.generateContent(`Answer this question concisely: "${question}"`);
        return res.json({ success: true, reply: result.response.text() });
      } catch (geminiErr) {
        console.error("Gemini fallback error:", geminiErr);
      }
    }
    res.json({ success: false, reply: "सर्वर में समस्या है, कृपया बाद में प्रयास करें!" });
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
      if (data && data.output && typeof data.output === "string" && data.output.trim()) return data.output.trim();
      if (data && data.output && data.output.captions && data.output.captions.length > 0) return data.output.captions[0].caption;
      if (data && Array.isArray(data.output) && data.output.length > 0) {
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
    const prompt = userQuery && userQuery.trim()
      ? `Analyze this image carefully and answer: "${userQuery}". Be detailed.`
      : `Describe this image in detail: objects, people, text, colors, scene.`;
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
    let finalAnswer = null, detected = "image";
    const geminiAnswer = await describeImageWithGemini(imageBuffer, mimeType, userQuery);
    if (geminiAnswer) {
      detected = "image (Gemini Vision)";
      finalAnswer = geminiAnswer;
    } else {
      const deepAICaption = await getImageCaptionDeepAI(imageBuffer, mimeType);
      if (deepAICaption) {
        detected = deepAICaption;
        const searchQuery = userQuery ? `${deepAICaption}: ${userQuery}` : `Tell me detailed information about "${deepAICaption}"`;
        try {
          const tavilyResponse = await tvly.search(searchQuery, { searchDepth: "advanced", maxResults: 5, includeAnswer: true });
          finalAnswer = tavilyResponse.answer;
          if (!finalAnswer && tavilyResponse.results?.length) {
            finalAnswer = tavilyResponse.results.slice(0,3).map(r => `**${r.title}**\n${r.content.substring(0,400)}...`).join("\n\n");
          }
          if (!finalAnswer) finalAnswer = `I can see: ${deepAICaption}.`;
        } catch (tavilyErr) {
          console.error("Tavily error:", tavilyErr.message);
          finalAnswer = `The image shows: ${deepAICaption}.`;
        }
      } else {
        return res.json({ success: false, error: "Could not analyze this image. Please try a clearer JPG/PNG under 5MB." });
      }
    }
    res.json({ success: true, detected, answer: finalAnswer });
  } catch (error) {
    console.error("Image analysis error:", error);
    res.status(500).json({ success: false, error: "Image processing failed: " + error.message });
  }
});

// ========== SERVER START ==========
app.get("/ranai", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Tavily AI ready`);
  console.log(`✅ DeepAI ready`);
  console.log(`✅ Gemini Vision ready`);
  console.log(`📧 OTP sent via email`);
  console.log(`🔐 Login endpoint added`);
  console.log(`💬 Local conversation & math handler active`);
});
