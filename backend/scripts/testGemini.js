require("dotenv").config();

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!apiKey) {
    throw new Error("Chưa cấu hình GEMINI_API_KEY trong backend/.env");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=` +
    `${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Hãy trả lời đúng một câu: Xin chào từ Trợ lý AI Huỳnh Gia.",
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("HTTP status:", response.status);
    console.error("Gemini error:", data.error?.message || data);
    process.exit(1);
  }

  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("\n")
    .trim();

  console.log("GEMINI OK:");
  console.log(answer);
}

testGemini().catch((error) => {
  console.error("Lỗi kiểm tra Gemini:", error.message);
  process.exit(1);
});