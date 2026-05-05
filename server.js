import express from "express";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();

app.use(express.json({ limit: "1mb" }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many messages. Please take a short break and try again."
  }
});

app.use(express.static("."));

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const SYSTEM_PROMPT = `
You are a gentle AI thought-sorting assistant inside a student wellbeing website called "Take a Break".

Your job:
- Help users slow down and sort messy thoughts.
- Use a warm, calm, supportive tone.
- Keep replies short.
- Do not over-explain.
- Do not diagnose mental health conditions.
- Do not pretend to be a therapist, doctor, or emergency service.
- Help the user find one tiny next step.

Style:
- Start with one validating sentence.
- Then give 2 to 4 short bullet points.
- End with one very small next action.

Important safety rule:
If the user mentions suicide, self-harm, immediate danger, abuse, or not being safe:
- Respond with care.
- Tell them this chatbox is not emergency support.
- Encourage them to contact local emergency services immediately.
- Encourage them to reach out to a trusted person nearby.
- If they are in the U.S. or Canada, mention 988.
`;

function looksLikeCrisis(text) {
  const lower = String(text || "").toLowerCase();

  const crisisPatterns = [
    "suicide",
    "kill myself",
    "hurt myself",
    "self harm",
    "self-harm",
    "end my life",
    "i want to die",
    "i don't want to live",
    "i dont want to live",
    "not safe",
    "abuse",
    "abused",
    "想死",
    "自杀",
    "不想活",
    "伤害自己",
    "撑不下去",
    "活不下去"
  ];

  return crisisPatterns.some((phrase) => lower.includes(phrase));
}

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({
        error: "DeepSeek API key is not configured."
      });
    }

    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        error: "Invalid messages format."
      });
    }

    const safeMessages = messages
      .slice(-8)
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: String(message.content || "").slice(0, 1000)
      }))
      .filter((message) => message.content.trim().length > 0);

    const latestUserMessage = [...safeMessages]
      .reverse()
      .find((message) => message.role === "user");

    if (latestUserMessage && looksLikeCrisis(latestUserMessage.content)) {
      return res.json({
        reply:
          "I'm really sorry you're feeling this much pain. This chatbox is not emergency support. If you might hurt yourself or are in immediate danger, please call your local emergency number now, or reach out to a trusted person nearby. If you are in the U.S. or Canada, you can call or text 988 for immediate crisis support."
      });
    }

    const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          ...safeMessages
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    const data = await deepseekResponse.json();

    if (!deepseekResponse.ok) {
      console.error("DeepSeek error:", data);

      return res.status(500).json({
        error: "DeepSeek request failed."
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "I'm here with you, but I got a little tangled. Could you try saying that again in one sentence?";

    return res.json({ reply });
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "The chat service is having a small technical wobble. Please try again."
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Take a Break server running on http://localhost:${PORT}`);
});