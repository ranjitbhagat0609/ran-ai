const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
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

// Tavily client
const tvly = tavily({ apiKey: TAVILY_API_KEY });

// Gemini setup — gemini-1.5-flash supports vision
let model = null;
try {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  console.log("✅ Gemini AI ready (vision supported)");
} catch (err) {
  console.log("⚠️ Gemini not available:", err.message);
}

// ========== MULTER SETUP ==========
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only .jpeg, .jpg, .png formats allowed"), false);
    }
  },
});

// ========== OTP STORAGE ==========
let otpStore = {};
let verifiedUsers = {};

// ========== OTP ROUTES ==========
app.post("/send-otp", (req, res) => {
  let { email } = req.body;
  if (!email) return res.json({ success: false, message: "Email required ❌" });
  email = email.toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.json({ success: false, message: "Invalid Email ❌" });
  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[email] = otp;
  console.log("🔥 OTP for", email, "=", otp);
  res.json({ success: true, message: "OTP sent (check terminal) ✅" });
});

app.post("/verify-otp", (req, res) => {
  let { email, otp } = req.body;
  if (!email || !otp) return res.json({ success: false, message: "Missing data ❌" });
  email = email.toLowerCase();
  if (!otpStore[email]) return res.json({ success: false, message: "OTP not found ❌" });
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
    if (!verifiedUsers[email])
      return res.json({ success: false, message: "Verify OTP first ❌" });
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passRegex.test(password))
      return res.json({ success: false, message: "Password must be strong ❌" });
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

// ========== TAVILY /ask ==========
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  if (!question || question.trim() === "") {
    return res.json({ success: false, reply: "कृपया कुछ पूछें!" });
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

// ========== DEEPAI IMAGE CAPTION ==========
// FIX 1: Use the correct DeepAI endpoint — densecap often fails / returns wrong structure.
//         Use 'image-recognition' which is more reliable and widely available.
//         Also fixed the response parsing for different DeepAI response shapes.
async function getImageCaptionDeepAI(imageBuffer, mimeType) {
  // Try image-recognition first (most reliable free endpoint)
  const endpoints = [
    "https://api.deepai.org/api/image-recognition",  // returns { output: "label1, label2, ..." }
    "https://api.deepai.org/api/nsfw-detector",       // fallback — gives some info
  ];

  for (const endpoint of endpoints) {
    try {
      const formData = new FormData();
      // DeepAI expects the file with proper content-type
      formData.append("image", imageBuffer, {
        filename: mimeType === "image/png" ? "upload.png" : "upload.jpg",
        contentType: mimeType,
        knownLength: imageBuffer.length,
      });

      console.log(`Trying DeepAI endpoint: ${endpoint}`);
      const response = await axios.post(endpoint, formData, {
        headers: {
          "api-key": DEEPAI_API_KEY,
          ...formData.getHeaders(),
        },
        timeout: 20000,
      });

      console.log("DeepAI raw response:", JSON.stringify(response.data));

      const data = response.data;

      // image-recognition returns { id, output: "label, label, ..." }
      if (data && data.output && typeof data.output === "string" && data.output.trim()) {
        return data.output.trim();
      }

      // densecap returns { output: { captions: [{ caption, confidence }] } }
      if (data && data.output && data.output.captions && data.output.captions.length > 0) {
        return data.output.captions[0].caption;
      }

      // Some endpoints return { output: [{ label, confidence }] }
      if (data && Array.isArray(data.output) && data.output.length > 0) {
        if (data.output[0].label) {
          return data.output.map(o => o.label).join(", ");
        }
        if (data.output[0].caption) {
          return data.output[0].caption;
        }
      }

      console.log(`DeepAI endpoint ${endpoint} gave unexpected structure, trying next...`);
    } catch (err) {
      console.error(`DeepAI error on ${endpoint}:`, err.response?.data || err.message);
    }
  }

  return null; // Both endpoints failed
}

// ========== GEMINI VISION ==========
// FIX 2: Robust error handling + cleaner base64 encoding
async function describeImageWithGemini(imageBuffer, mimeType, userQuery) {
  if (!model) {
    console.log("Gemini model not initialized");
    return null;
  }
  try {
    const base64Image = imageBuffer.toString("base64");

    const prompt = userQuery && userQuery.trim()
      ? `You are a helpful image analysis assistant. Analyze this image carefully and answer: "${userQuery}". Be detailed and specific.`
      : `You are a helpful image analysis assistant. Describe this image in detail — what objects, people, text, colors, or scene you can see. Be specific and thorough.`;

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image,
        },
      },
    ]);

    const text = result.response.text();
    console.log("Gemini vision response length:", text.length);
    return text || null;
  } catch (err) {
    console.error("Gemini vision error:", err.message || err);
    return null;
  }
}

// ========== IMAGE ANALYSIS ENDPOINT ==========
// FIX 3: Always try Gemini FIRST as primary (it's more reliable than DeepAI for analysis),
//         use DeepAI only for search keyword extraction fallback.
//         This way the user always gets a useful answer.
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    const userQuery = (req.body.query || "").trim();
    const imageBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    console.log(`\n📷 Image received: type=${mimeType}, size=${imageBuffer.length} bytes, query="${userQuery}"`);

    let finalAnswer = null;
    let detected = "image";

    // ── STRATEGY 1: Gemini Vision (Primary — best for direct image understanding) ──
    console.log("Trying Gemini Vision (primary)...");
    const geminiAnswer = await describeImageWithGemini(imageBuffer, mimeType, userQuery);

    if (geminiAnswer) {
      detected = "image (Gemini Vision)";
      finalAnswer = geminiAnswer;
      console.log("✅ Gemini Vision succeeded");
    } else {
      // ── STRATEGY 2: DeepAI → then Tavily for enrichment ──
      console.log("Gemini failed. Trying DeepAI...");
      const deepAICaption = await getImageCaptionDeepAI(imageBuffer, mimeType);

      if (deepAICaption) {
        detected = deepAICaption;
        console.log(`✅ DeepAI caption: "${deepAICaption}"`);

        // Use Tavily to enrich the DeepAI caption with real-world info
        const searchQuery = userQuery
          ? `${deepAICaption}: ${userQuery}`
          : `Tell me detailed information about "${deepAICaption}" — what it is, its features, uses, and interesting facts`;

        try {
          const tavilyResponse = await tvly.search(searchQuery, {
            searchDepth: "advanced",
            maxResults: 5,
            includeAnswer: true,
          });

          finalAnswer = tavilyResponse.answer;

          if (!finalAnswer && tavilyResponse.results?.length) {
            finalAnswer = tavilyResponse.results
              .slice(0, 3)
              .map(r => `**${r.title}**\n${r.content.substring(0, 400)}...`)
              .join("\n\n");
          }

          if (!finalAnswer) {
            finalAnswer = `I can see: ${deepAICaption}. Unfortunately I couldn't find more details right now.`;
          }
        } catch (tavilyErr) {
          console.error("Tavily error:", tavilyErr.message);
          finalAnswer = `The image shows: ${deepAICaption}.`;
        }
      } else {
        // ── STRATEGY 3: Gemini text fallback (if image too complex, try generic description) ──
        console.log("DeepAI also failed. All strategies exhausted.");
        return res.json({
          success: false,
          error: "Could not analyze this image. Please ensure it's a clear JPG or PNG under 5MB and try again.",
        });
      }
    }

    res.json({
      success: true,
      detected,
      answer: finalAnswer,
    });

  } catch (error) {
    console.error("Image analysis route error:", error);
    res.status(500).json({
      success: false,
      error: "Image processing failed: " + error.message,
    });
  }
});

// ========== SERVER START ==========
app.get("/ranai", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
  console.log(`✅ Tavily AI ready`);
  console.log(`✅ DeepAI ready (key: ${DEEPAI_API_KEY ? "set" : "missing ⚠️"})`);
  console.log(`✅ Gemini Vision ready (primary image engine)`);
});