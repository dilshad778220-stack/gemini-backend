// server.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

// Load environment variables
dotenv.config();

// Import Firebase service account using CommonJS
const serviceAccount = require("./serviceAccountKey.json");

const app = express();
const port = process.env.PORT || 5000;

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "demo-key");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// --- System Prompt ---
const SYSTEM_PROMPT = `
You are TutorUp AI, a helpful and friendly teacher.
- Keep answers short (2–3 sentences, under 150 tokens).
- If user says "explain in detail", allow longer answers (up to 400 tokens).
- Use simple words and examples.
- Prefer bullet points when useful.
`;

// --- Save message to Firestore ---
async function saveMessage(uid, role, text) {
  try {
    await db.collection("users").doc(uid).collection("chats").add({
      role,
      text,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("🔥 Firestore Save Error:", error);
  }
}

// --- Debug Endpoint ---
app.get("/api/debug", (req, res) => {
  const hasApiKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "demo-key");
  res.json({
    hasApiKey,
    apiKey: hasApiKey ? process.env.GEMINI_API_KEY.substring(0, 10) + "..." : "not set",
    apiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    serverTime: new Date().toISOString(),
  });
});

// --- Gemini AI Endpoint ---
app.post("/api/gemini", async (req, res) => {
  try {
    const { prompt, uid } = req.body;
    if (!prompt || !uid) return res.status(400).json({ success: false, message: "Prompt and UID required" });

    console.log(`📩 Received prompt from UID: ${uid}: "${prompt}"`);

    // Save user message
    await saveMessage(uid, "user", prompt);

    // Demo mode
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "demo-key") {
      const demoResponse = `I'm Gemini AI! You said: "${prompt}". Please set your GEMINI_API_KEY in .env to get real AI responses.`;
      await saveMessage(uid, "assistant", demoResponse);
      return res.json({
        success: true,
        reply: demoResponse,
        isDemo: true,
      });
    }

    // Fetch chat history
    const chatHistorySnapshot = await db.collection("users").doc(uid).collection("chats").orderBy("timestamp", "asc").get();
    const history = chatHistorySnapshot.docs.map(doc => {
      const { role, text } = doc.data();
      return { role: role === "assistant" ? "model" : "user", parts: [{ text }] };
    });
    history.pop(); // remove current prompt

    // Token limit adjustment
    let tokenLimit = prompt.toLowerCase().includes("detail") ? 400 : 200;

    // Configure Gemini model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      systemInstruction: SYSTEM_PROMPT,
    });

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: tokenLimit,
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      },
    });

    const result = await chat.sendMessage(prompt);
    const text = (await result.response).text();

    await saveMessage(uid, "assistant", text);

    res.json({ success: true, reply: text, isDemo: false });
  } catch (apiError) {
    console.error("❌ Gemini API Error:", apiError);
    res.status(500).json({
      success: false,
      reply: "Sorry, I encountered an error while generating a response. Please try again.",
      isDemo: false,
    });
  }
});

// --- Fetch User Chat History ---
app.get("/api/history/:uid", async (req, res) => {
  const { uid } = req.params;
  try {
    const snapshot = await db.collection("users").doc(uid).collection("chats").orderBy("timestamp", "asc").get();
    const history = snapshot.docs.map(doc => doc.data());
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Test Endpoint ---
app.get("/api/test-gemini", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "demo-key") {
      return res.json({ success: false, message: "API key not set" });
    }
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent("Hello");
    const text = (await result.response).text();
    res.json({ success: true, message: "Gemini API test successful", response: text });
  } catch (error) {
    res.json({ success: false, message: "Gemini API test failed", error: error.message });
  }
});

// --- Health Check ---
app.get("/api/health", (req, res) => {
  const hasApiKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "demo-key");
  res.json({
    status: "OK",
    message: "Server is running",
    port,
    hasApiKey,
    apiKeyStatus: hasApiKey ? "Configured ✅" : "Not configured 🔶",
    timestamp: new Date().toISOString(),
  });
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  const hasApiKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "demo-key");
  console.log(hasApiKey
    ? `✅ GEMINI_API_KEY is set (starts with: ${process.env.GEMINI_API_KEY.substring(0,10)}...)`
    : `🔶 DEMO MODE - Set GEMINI_API_KEY in .env for real AI`
  );
  console.log(`🔧 Debug: http://localhost:${port}/api/debug`);
  console.log(`🧪 API Test: http://localhost:${port}/api/test-gemini`);
});
