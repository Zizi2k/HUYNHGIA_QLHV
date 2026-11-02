import { useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import "./AIChatbot.css";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Xin chào! Tôi là Trợ lý AI Huỳnh Gia. Tôi có thể hỗ trợ bạn tra cứu khóa học, bài tập, học phí và giải thích kiến thức học tập.",
};

const SUGGESTIONS = [
  { icon: "bi-mortarboard", label: "Khóa học", text: "Trung tâm hiện có khóa học nào?" },
  { icon: "bi-journal-check", label: "Bài tập", text: "Tôi có bài tập nào cần hoàn thành?" },
  { icon: "bi-wallet2", label: "Học phí", text: "Học phí của tôi còn bao nhiêu?" },
];

export default function AIChatbot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, isOpen]);

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
        { role: "assistant", content: response.data.answer || "Tôi chưa thể tạo câu trả lời." },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error.response?.data?.message || "Không thể kết nối với Trợ lý AI. Vui lòng thử lại.",
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

  const resetConversation = () => {
    if (loading) return;
    setMessages([WELCOME_MESSAGE]);
    setInput("");
  };

  return (
    <div className="ai-chatbot">
      {isOpen && (
        <section className="ai-chatbot-panel" aria-label="Trợ lý AI Huỳnh Gia">
          <header className="ai-chatbot-header">
            <div className="ai-chatbot-brand">
              <span className="ai-chatbot-brand-icon"><i className="bi bi-stars" /></span>
              <div>
                <strong>Huỳnh Gia AI</strong>
                <small><span className="ai-online-dot" /> Trợ lý học tập đang trực tuyến</small>
              </div>
            </div>
            <div className="ai-chatbot-header-actions">
              <button type="button" onClick={resetConversation} disabled={loading} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới">
                <i className="bi bi-arrow-counterclockwise" />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Đóng chatbot" title="Đóng">
                <i className="bi bi-x-lg" />
              </button>
            </div>
          </header>

          <div className="ai-chatbot-context-bar">
            <span><i className="bi bi-shield-check" /> Dữ liệu theo tài khoản của bạn</span>
            <small>AI không tự ý thay đổi điểm, học phí hay hồ sơ.</small>
          </div>

          <div className="ai-chatbot-messages" ref={messagesRef}>
            {messages.map((message, index) => (
              <div className={`ai-message-row ${message.role}`} key={`${message.role}-${index}`}>
                {message.role === "assistant" && <span className="ai-message-avatar"><i className="bi bi-robot" /></span>}
                <div className={`ai-message ai-message-${message.role}${message.error ? " ai-message-error" : ""}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-message-row assistant">
                <span className="ai-message-avatar"><i className="bi bi-robot" /></span>
                <div className="ai-message ai-message-assistant ai-typing" aria-label="AI đang trả lời">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="ai-chatbot-suggestions">
              <div className="ai-suggestion-title">Bạn có thể hỏi</div>
              <div className="ai-suggestion-grid">
                {SUGGESTIONS.map((suggestion) => (
                  <button type="button" key={suggestion.text} onClick={() => sendMessage(suggestion.text)}>
                    <span><i className={`bi ${suggestion.icon}`} /></span>
                    <div><strong>{suggestion.label}</strong><small>{suggestion.text}</small></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className="ai-chatbot-form" onSubmit={handleSubmit}>
            <div className="ai-chatbot-input-wrap">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Hỏi AI Huỳnh Gia..."
                rows="1"
                maxLength="5000"
                disabled={loading}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button type="submit" disabled={loading || !input.trim()} aria-label="Gửi câu hỏi">
                <i className="bi bi-arrow-up" />
              </button>
            </div>
            <small>Enter để gửi · Shift + Enter để xuống dòng</small>
          </form>
        </section>
      )}

      <button
        type="button"
        className={`ai-chatbot-toggle${isOpen ? " is-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-label={isOpen ? "Đóng Trợ lý AI" : "Mở Trợ lý AI"}
      >
        <span className="ai-toggle-glow" />
        <i className={`bi ${isOpen ? "bi-x-lg" : "bi-stars"}`} />
        {!isOpen && <span className="ai-toggle-label">AI</span>}
      </button>
    </div>
  );
}