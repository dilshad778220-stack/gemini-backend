// server.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Load environment variables
dotenv.config();

// --- Firebase Setup ---
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT environment variable is not set!");
  process.exit(1);
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// --- Gemini Setup ---
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY environment variable is not set!");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

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
  res.json({
    serverTime: new Date().toISOString(),
    port,
  });
});

// --- Fetch User Chat History ---
app.get("/api/history/:uid", async (req, res) => {
  const { uid } = req.params;
  try {
    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("chats")
      .orderBy("timestamp", "asc")
      .get();
    const history = snapshot.docs.map((doc) => doc.data());
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Health Check ---
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Server is running",
    port,
    timestamp: new Date().toISOString(),
  });
});

// --- Gemini AI Response Endpoint ---
app.post("/api/gemini", async (req, res) => {
  const { prompt, uid } = req.body;
  if (!prompt || !uid) {
    return res
      .status(400)
      .json({ success: false, message: "Prompt and UID required" });
  }

  // Save user message
  await saveMessage(uid, "user", prompt);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const result = await model.generateContent(prompt);
    const aiReply = result.response.text();

    // Save assistant reply
    await saveMessage(uid, "assistant", aiReply);

    res.json({ success: true, reply: aiReply, isDemo: false });
  } catch (error) {
    console.error("❌ Gemini API Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Gemini API request failed" });
  }
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🔧 Debug: http://localhost:${port}/api/debug`);
});
