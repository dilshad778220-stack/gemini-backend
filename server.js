// server.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");

// Load environment variables
dotenv.config();

// Load Firebase service account from environment variable
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT environment variable is not set!");
  process.exit(1);
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

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
    const snapshot = await db.collection("users").doc(uid).collection("chats").orderBy("timestamp", "asc").get();
    const history = snapshot.docs.map(doc => doc.data());
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

// --- Optional: Demo AI Response Endpoint ---
app.post("/api/gemini", async (req, res) => {
  const { prompt, uid } = req.body;
  if (!prompt || !uid) return res.status(400).json({ success: false, message: "Prompt and UID required" });

  // Save user message
  await saveMessage(uid, "user", prompt);

  // Demo AI reply
  const demoReply = `Demo AI: You said "${prompt}". Replace with real AI integration later.`;
  await saveMessage(uid, "assistant", demoReply);

  res.json({ success: true, reply: demoReply, isDemo: true });
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🔧 Debug: http://localhost:${port}/api/debug`);
});
