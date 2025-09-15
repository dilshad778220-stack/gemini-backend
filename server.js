import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";
// Make sure your serviceAccountKey.json is in the same directory
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

dotenv.config();

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

// --- Gemini AI Endpoint (Corrected Version) ---
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
      // Also save the demo response to history
      await saveMessage(uid, "assistant", demoResponse);
      return res.json({
        success: true,
        reply: demoResponse,
        isDemo: true,
      });
    }

    // 1. Fetch and Format Chat History
    const chatHistorySnapshot = await db.collection("users").doc(uid).collection("chats").orderBy("timestamp", "asc").get();
    const history = chatHistorySnapshot.docs.map(doc => {
      const { role, text } = doc.data();
      const geminiRole = role === "assistant" ? "model" : "user";
      return {
        role: geminiRole,
        parts: [{ text }],
      };
    });

    // Remove the most recent message from history, as it's the current prompt
    history.pop();

    // 2. Adjust Token Limits
    let tokenLimit = 200; // Default token limit
    if (prompt.toLowerCase().includes("detail")) {
      tokenLimit = 400;
      console.log("🔍 'detail' keyword detected, increasing token limit to 400");
    }

    // Configure model
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });
    
    // 3. Use startChat() with history
    const chat = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: tokenLimit,
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      },
    });

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();

    // Save AI response
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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello");
    const response = await result.response;
    const text = await response.text();
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
  if (hasApiKey) {
    console.log(`✅ GEMINI_API_KEY is set (starts with: ${process.env.GEMINI_API_KEY.substring(0,10)}...)`);
  } else {
    console.log(`🔶 DEMO MODE - Set GEMINI_API_KEY in .env for real AI`);
  }
  console.log(`🔧 Debug: http://localhost:${port}/api/debug`);
  console.log(`🧪 API Test: http://localhost:${port}/api/test-gemini`);
});
          
