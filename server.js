// --- Gemini AI Endpoint ---
app.post("/api/gemini", async (req, res) => {
  try {
    const { prompt, uid } = req.body;
    if (!prompt || !uid) return res.status(400).json({ success: false, message: "Prompt and UID required" });

    console.log("📩 Received prompt:", prompt);

    // Save user message (you were already doing this correctly)
    await saveMessage(uid, "user", prompt);

    // Demo mode (no changes here)
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "demo-key") {
      return res.json({
        success: true,
        text: `I'm Gemini AI! You said: "${prompt}". Please set your GEMINI_API_KEY in .env to get real AI responses.`,
        isDemo: true,
      });
    }

    // --- FIX #1: Fetch and Format Chat History ---
    const chatHistorySnapshot = await db.collection("users").doc(uid).collection("chats").orderBy("timestamp", "asc").get();
    const history = chatHistorySnapshot.docs.map(doc => {
      const { role, text } = doc.data();
      // The API expects "model" for the assistant's role, not "assistant"
      const geminiRole = role === "assistant" ? "model" : "user"; 
      return {
        role: geminiRole,
        parts: [{ text }],
      };
    });

    // We remove the last message from history because it's the new prompt we are about to send
    history.pop(); 

    // --- FIX #2: Adjust Token Limits (as per your request) ---
    // Changed base token limit from 150 to 200
    let tokenLimit = 200; 
    if (prompt.toLowerCase().includes("detail")) {
      tokenLimit = 400;
      console.log("🔍 'detail' keyword detected, increasing token limit to 400");
    }

    // Configure model (no major changes, just moved config here)
    const generationConfig = {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: tokenLimit,
    };
    
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Using 1.5-flash is often a good balance of cost/performance
      systemInstruction: SYSTEM_PROMPT, // Use the dedicated system instruction parameter
    });

    // --- FIX #3: Use startChat() with history ---
    const chat = model.startChat({
        history: history,
        generationConfig: generationConfig,
    });

    const result = await chat.sendMessage(prompt); // Send only the new prompt
    const response = await result.response;
    const text = response.text();

    // Save AI response (you were already doing this correctly)
    await saveMessage(uid, "assistant", text);

    res.json({ success: true, reply: text, isDemo: false });
  } catch (apiError) {
    console.error("❌ Gemini API Error:", apiError);
    // Provide a more user-friendly error
    res.status(500).json({
      success: false,
      text: "Sorry, I encountered an error while generating a response. Please try again.",
      isDemo: false, // It's a real error, not a demo response
    });
  }
});
        
