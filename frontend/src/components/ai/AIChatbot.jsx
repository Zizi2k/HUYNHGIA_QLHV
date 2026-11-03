import { useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import "./AIChatbot.css";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Xin chào! Tôi là Trợ lý AI Huỳnh Gia 👋\nTôi có thể hỗ trợ học tập, khóa học, bài tập, học phí, Tin học, Ngoại ngữ và giải thích kiến thức theo từng bước.",
};

const SUGGESTIONS = [
  "Khóa học phù hợp với tôi",
  "Bài tập cần hoàn thành",
  "Kiểm tra học phí",
  "Giải thích bài học",
  "Hỗ trợ Tin học",
];

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatInline(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
  safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, "$1<em>$2</em>");
  return safe;
}

function renderMessageContent(content = "") {
  const lines = String(content).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 5);
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      return;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const unordered = trimmed.match(/^[-•]\s+(.+)$/);
    if (ordered || unordered) {
      const nextType = ordered ? "ol" : "ul";
      if (listType !== nextType) {
        closeList();
        html.push(`<${nextType}>`);
        listType = nextType;
      }
      html.push(`<li>${formatInline((ordered || unordered)[1])}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${formatInline(trimmed)}</p>`);
  });
  closeList();
  return html.join("");
}

export default function AIChatbot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, isOpen]);

  if (!user) return null;

  const sendMessage = async (text = input) => {
    const cleanText = String(text || "").trim();
    if (!cleanText || loading) return;

    const userMessage = { role: "user", content: cleanText };
    const previousMessages = messages.slice(-16);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await api.post("/ai/chat", { message: cleanText, history: previousMessages });
      setMessages((current) => [...current, {
        role: "assistant",
        content: response.data.answer || "Tôi chưa thể tạo câu trả lời.",
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error.response?.data?.message || "Không thể kết nối với Trợ lý AI. Vui lòng thử lại.",
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-chatbot">
      {isOpen && (
        <section className="ai-chatbot-panel" aria-label="Trợ lý AI Huỳnh Gia">
          <header className="ai-chatbot-header">
            <div className="ai-chatbot-heading">
              <span className="ai-chatbot-avatar"><i className="bi bi-stars" /></span>
              <div>
                <strong>Trợ lý AI Huỳnh Gia</strong>
                <small><span className="ai-online-dot" /> Sẵn sàng hỗ trợ</small>
              </div>
            </div>
            <button type="button" className="ai-chatbot-close" onClick={() => setIsOpen(false)} aria-label="Đóng chatbot"><i className="bi bi-x-lg" /></button>
          </header>

          <div className="ai-chatbot-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`ai-message-row ai-message-row-${message.role}`}>
                {message.role === "assistant" && <span className="ai-message-avatar"><i className="bi bi-stars" /></span>}
                <div className={`ai-message ai-message-${message.role}${message.error ? " ai-message-error" : ""}`}>
                  <div className="ai-message-content" dangerouslySetInnerHTML={{ __html: renderMessageContent(message.content) }} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-message-row ai-message-row-assistant">
                <span className="ai-message-avatar"><i className="bi bi-stars" /></span>
                <div className="ai-message ai-message-assistant ai-typing" aria-label="Trợ lý AI đang trả lời">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && (
            <div className="ai-chatbot-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => sendMessage(suggestion)}>
                  <i className="bi bi-lightning-charge" /> {suggestion}
                </button>
              ))}
            </div>
          )}

          <form className="ai-chatbot-form" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            <div className="ai-chatbot-input-wrap">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Hỏi Trợ lý AI..."
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
              <small>Enter để gửi · Shift + Enter để xuống dòng</small>
            </div>
            <button type="submit" disabled={loading || !input.trim()} aria-label="Gửi câu hỏi"><i className="bi bi-send-fill" /></button>
          </form>
        </section>
      )}

      <button type="button" className={`ai-chatbot-toggle${isOpen ? " is-open" : ""}${loading ? " is-thinking" : ""}`} onClick={() => setIsOpen((current) => !current)} aria-label={isOpen ? "Đóng Trợ lý AI" : "Mở Trợ lý AI"} title="Trợ lý AI Huỳnh Gia">
        <span className="ai-orb-halo" aria-hidden="true" />
        <span className="ai-orb-core" aria-hidden="true"><span className="ai-orb-face"><span className="ai-orb-eye ai-orb-eye-left" /><span className="ai-orb-eye ai-orb-eye-right" /><span className="ai-orb-smile" /></span><span className="ai-orb-spark ai-orb-spark-one" /><span className="ai-orb-spark ai-orb-spark-two" /></span>
        <span className="ai-orb-status" aria-hidden="true" />
      </button>
    </div>
  );
}
