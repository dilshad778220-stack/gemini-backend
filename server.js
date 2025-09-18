// server.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
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

// --- Start Server ---
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`🔧 Debug: http://localhost:${port}/api/debug`);
});
