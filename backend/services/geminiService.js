require("dotenv").config();

const DEFAULT_MODEL = "gemini-3.6-flash";

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-10)
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: String(item.content || "").slice(0, 3000),
        },
      ],
    }))
    .filter((item) => item.parts[0].text.trim() !== "");
}

async function askGemini({
  message,
  history = [],
  systemInstruction = "",
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const cleanMessage = String(message || "").trim();

  if (!apiKey) {
    const error = new Error(
      "Trợ lý AI chưa được cấu hình GEMINI_API_KEY"
    );
    error.status = 503;
    throw error;
  }

  if (!cleanMessage) {
    const error = new Error("Vui lòng nhập nội dung cần hỏi");
    error.status = 400;
    throw error;
  }

  if (cleanMessage.length > 5000) {
    const error = new Error(
      "Nội dung câu hỏi không được vượt quá 5000 ký tự"
    );
    error.status = 400;
    throw error;
  }

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${encodeURIComponent(model)}:generateContent?key=` +
    encodeURIComponent(apiKey);

  const requestBody = {
    contents: [
      ...normalizeHistory(history),
      {
        role: "user",
        parts: [{ text: cleanMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1200,
    },
  };

  if (systemInstruction.trim()) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30000),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "Gemini API error:",
      response.status,
      data.error?.message || "Unknown error"
    );

    const error = new Error(
      response.status === 429
        ? "Trợ lý AI đang nhận quá nhiều yêu cầu"
        : "Trợ lý AI đang bận, vui lòng thử lại"
    );

    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("\n")
    .trim();

  if (!answer) {
    const error = new Error(
      "Trợ lý AI chưa tạo được câu trả lời"
    );
    error.status = 502;
    throw error;
  }

  return answer;
}

module.exports = { askGemini };