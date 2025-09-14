import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "demo-key");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

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
    const { prompt } = req.body;

    if (!prompt) return res.status(400).json({ success: false, message: "Prompt is required" });

    console.log("📩 Received prompt:", prompt);

    // Check for demo mode
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "demo-key") {
      console.log("🔶 Using demo mode - no valid API key");
      return res.json({
        success: true,
        text: `I'm Gemini AI! You said: "${prompt}". Please set your GEMINI_API_KEY in the .env file to enable real AI responses.`,
        isDemo: true,
      });
    }

    console.log("🔑 API Key detected, calling Gemini...");
    console.log("API Key starts with:", process.env.GEMINI_API_KEY.substring(0, 10));

    // Configure and call model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();

    console.log("✅ Gemini API call successful");

    res.json({ success: true, text, isDemo: false });
  } catch (apiError) {
    console.error("❌ Gemini API Error:", apiError);

    // Build user-friendly error messages
    let errorMessage = "API Error";
    let userMessage = `I'm Gemini AI! You said: "${req.body.prompt}". `;

    if (apiError.message.includes("API key") || apiError.message.includes("401")) {
      errorMessage = "Invalid API key";
      userMessage += "There's an issue with the API key. Please check your GEMINI_API_KEY in the .env file.";
    } else if (apiError.message.includes("model") || apiError.message.includes("404")) {
      errorMessage = "Model not found";
      userMessage += "The AI model configuration needs to be updated.";
    } else if (apiError.message.includes("quota") || apiError.message.includes("429")) {
      errorMessage = "Quota exceeded";
      userMessage += "The API quota has been exceeded. Check your Google Cloud usage.";
    } else if (apiError.message.includes("permission") || apiError.message.includes("403")) {
      errorMessage = "Permission denied";
      userMessage += "API permission denied. Check your Google Cloud permissions.";
    } else {
      userMessage += `Technical issue: ${apiError.message}`;
    }

    res.json({ success: true, text: userMessage, isDemo: true, error: errorMessage });
  }
});

// --- Test Endpoint ---
app.get("/api/test-gemini", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "demo-key") {
      return res.json({ success: false, message: "API key not set" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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
    console.log(`✅ GEMINI_API_KEY is set`);
    console.log(`🔑 Key starts with: ${process.env.GEMINI_API_KEY.substring(0, 10)}...`);
  } else {
    console.log(`🔶 DEMO MODE - Set GEMINI_API_KEY in .env for real AI`);
    console.log(`   Get key from: https://makersuite.google.com/`);
  }
  console.log(`🌐 Open http://localhost:${port} in your browser`);
  console.log(`🔧 Debug: http://localhost:${port}/api/debug`);
  console.log(`🧪 API Test: http://localhost:${port}/api/test-gemini`);
});
