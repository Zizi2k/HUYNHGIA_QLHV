import { useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import "./AIChatbot.css";

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "Xin chào! Tôi là Trợ lý AI Huỳnh Gia. Tôi có thể hỗ trợ bạn về khóa học, bài tập và học phí.",
};

const SUGGESTIONS = [
  "Trung tâm hiện có khóa học nào?",
  "Tôi có bài tập nào cần hoàn thành?",
  "Học phí của tôi còn bao nhiêu?",
];

export default function AIChatbot() {
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const sendMessage = async (text = input) => {
    const cleanText = String(text || "").trim();
    if (!cleanText || loading) return;

    const userMessage = { role: "user", content: cleanText };
    const previousMessages = messages.slice(-10);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await api.post("/ai/chat", {
        message: cleanText,
        history: previousMessages,
      });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.data.answer || "Tôi chưa thể tạo câu trả lời.",
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            error.response?.data?.message ||
            "Không thể kết nối với Trợ lý AI. Vui lòng thử lại.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  return (
    <div className="ai-chatbot">
      {isOpen && (
        <section className="ai-chatbot-panel">
          <header className="ai-chatbot-header">
            <div>
              <strong>Trợ lý AI Huỳnh Gia</strong>
              <small>Hỗ trợ học tập trực tuyến</small>
            </div>
            <button type="button" className="ai-chatbot-close" onClick={() => setIsOpen(false)} aria-label="Đóng chatbot">×</button>
          </header>

          <div className="ai-chatbot-messages">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`ai-message ai-message-${message.role}${message.error ? " ai-message-error" : ""}`}
              >
                {message.content}
              </div>
            ))}
            {loading && <div className="ai-message ai-message-assistant">Trợ lý AI đang trả lời...</div>}
          </div>

          {messages.length <= 1 && (
            <div className="ai-chatbot-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => sendMessage(suggestion)}>{suggestion}</button>
              ))}
            </div>
          )}

          <form className="ai-chatbot-form" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Nhập câu hỏi..."
              rows="2"
              maxLength="5000"
              disabled={loading}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button type="submit" disabled={loading || !input.trim()}>Gửi</button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={`ai-chatbot-toggle${isOpen ? " is-open" : ""}${loading ? " is-thinking" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-label={isOpen ? "Đóng Trợ lý AI" : "Mở Trợ lý AI"}
        title="Trợ lý AI Huỳnh Gia"
      >
        <span className="ai-orb-halo" aria-hidden="true" />
        <span className="ai-orb-core" aria-hidden="true">
          <span className="ai-orb-face">
            <span className="ai-orb-eye ai-orb-eye-left" />
            <span className="ai-orb-eye ai-orb-eye-right" />
            <span className="ai-orb-smile" />
          </span>
          <span className="ai-orb-spark ai-orb-spark-one" />
          <span className="ai-orb-spark ai-orb-spark-two" />
        </span>
        <span className="ai-orb-status" aria-hidden="true" />
      </button>
    </div>
  );
}
