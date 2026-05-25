import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, ThumbsUp, ThumbsDown, Send } from "lucide-react";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const QUICK_ACTIONS = [
  { label: "¿Qué es el Score?", message: "¿Qué es el Sentinel Score?" },
  { label: "No veo señales", message: "No veo señales en el feed" },
  { label: "Bot Telegram", message: "¿Cómo activo las alertas en Telegram?" }
];

export default function SentinelBot() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setOpen(true);
    window.addEventListener("open-support-chat", handler);
    return () => window.removeEventListener("open-support-chat", handler);
  }, []);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;

    const userMsg = { role: "user", content: text, id: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const apiUrl = getPublicApiUrl();
    try {
      const res = await fetch(`${apiUrl}/api/v1/bot/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode,
          language: "es",
          sessionId:
            typeof window !== "undefined" ? localStorage.getItem("sl-session") || "anonymous" : "anonymous"
        })
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: data.answer,
          source: data.source,
          thumbsId: data.thumbsId,
          id: Date.now() + 1
        }
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: "Error de conexión. Intenta de nuevo.",
          source: "error",
          id: Date.now() + 1
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendFeedback = async (thumbsId, vote) => {
    if (!thumbsId) return;
    const apiUrl = getPublicApiUrl();
    try {
      await fetch(`${apiUrl}/api/v1/bot/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbsId, vote })
      });
      setMessages((prev) => prev.map((m) => (m.thumbsId === thumbsId ? { ...m, voted: vote } : m)));
    } catch {
      // silent
    }
  };

  if (typeof window === "undefined") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-[200] min-h-11 min-w-11 w-11 h-11 bg-sl-card border border-sl-border flex items-center justify-center transition-all duration-150 hover:border-sl-violet hover:shadow-lg md:bottom-6 md:right-6 md:w-12 md:h-12"
        style={{ borderRadius: "50%" }}
        title="Sentinel Assistant"
      >
        {open ? (
          <X size={18} className="text-sl-muted" />
        ) : (
          <MessageCircle size={18} className="text-sl-violet" />
        )}
        {messages.length > 0 && !open && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 bg-sl-violet text-white text-[9px] flex items-center justify-center"
            style={{ borderRadius: "50%" }}
          >
            {messages.filter((m) => m.role === "bot").length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] right-4 z-[199] w-[360px] bg-sl-panel border border-sl-border flex flex-col overflow-hidden max-w-[calc(100vw-1.5rem)] md:bottom-20 md:right-6"
          style={{
            height: "480px",
            borderRadius: "8px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-sl-border flex-shrink-0">
            <span className="font-mono text-xs text-sl-muted uppercase tracking-wider">SENTINEL ASSISTANT</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode("chat")}
                className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors duration-150 border ${
                  mode === "chat"
                    ? "border-sl-violet text-sl-violet bg-sl-violet/10"
                    : "border-sl-border text-sl-muted hover:text-sl-sub"
                }`}
                style={{ borderRadius: "2px" }}
              >
                CHAT
              </button>
              <button
                type="button"
                onClick={() => setMode("diagnostic")}
                className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors duration-150 border ${
                  mode === "diagnostic"
                    ? "border-sl-violet text-sl-violet bg-sl-violet/10"
                    : "border-sl-border text-sl-muted hover:text-sl-sub"
                }`}
                style={{ borderRadius: "2px" }}
              >
                DIAGNÓSTICO
              </button>
              <button
                type="button"
                onClick={() => setMode("operator")}
                className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors duration-150 border ${
                  mode === "operator"
                    ? "border-sl-violet text-sl-violet bg-sl-violet/10"
                    : "border-sl-border text-sl-muted hover:text-sl-sub"
                }`}
                style={{ borderRadius: "2px" }}
              >
                OPERADOR
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="font-mono text-[10px] text-sl-muted text-center uppercase tracking-wider">
                  {mode === "chat"
                    ? "Chat general"
                    : mode === "diagnostic"
                      ? "Diagnóstico del sistema"
                      : "Operador (requiere OK explícito)"}
                </p>
                {mode === "chat" &&
                  QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa.label}
                      type="button"
                      onClick={() => sendMessage(qa.message)}
                      className="w-full text-left px-3 py-2 bg-sl-card border border-sl-border font-mono text-xs text-sl-sub hover:border-sl-violet hover:text-sl-text transition-colors duration-150"
                      style={{ borderRadius: "4px" }}
                    >
                      &rsaquo; {qa.label}
                    </button>
                  ))}
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 font-ui text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-sl-violet text-white"
                      : "bg-sl-card border border-sl-border text-sl-text"
                  }`}
                  style={{ borderRadius: "6px" }}
                >
                  {msg.content}
                  {msg.source && msg.role === "bot" && (
                    <span className="block mt-1 font-mono text-[9px] text-sl-muted">via {msg.source}</span>
                  )}
                </div>
                {msg.role === "bot" && msg.thumbsId && !msg.voted && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => sendFeedback(msg.thumbsId, "up")}
                      className="p-1 text-sl-muted hover:text-sl-green transition-colors"
                    >
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => sendFeedback(msg.thumbsId, "down")}
                      className="p-1 text-sl-muted hover:text-sl-red transition-colors"
                    >
                      <ThumbsDown size={12} />
                    </button>
                  </div>
                )}
                {msg.voted && (
                  <span className="font-mono text-[9px] text-sl-muted">
                    {msg.voted === "up" ? "✓ útil" : "✗ mejorable"}
                  </span>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-start">
                <div className="bg-sl-card border border-sl-border px-3 py-2" style={{ borderRadius: "6px" }}>
                  <div className="flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 bg-sl-violet rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-1.5 h-1.5 bg-sl-violet rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-1.5 h-1.5 bg-sl-violet rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex items-center gap-2 p-3 border-t border-sl-border flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
              placeholder={
                mode === "chat"
                  ? "Escribe tu mensaje..."
                  : mode === "diagnostic"
                    ? "Describe el problema o métrica..."
                    : "Escribe: OK ejecutar (para autorizar acciones)"
              }
              className="flex-1 h-8 px-3 bg-sl-root border border-sl-border font-mono text-xs text-sl-text placeholder:text-sl-muted focus:border-sl-violet focus:outline-none transition-colors duration-150"
              style={{ borderRadius: "2px" }}
              disabled={loading}
              maxLength={500}
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="h-8 w-8 flex items-center justify-center bg-sl-violet border border-sl-violet text-white disabled:opacity-40 transition-opacity duration-150"
              style={{ borderRadius: "2px" }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
