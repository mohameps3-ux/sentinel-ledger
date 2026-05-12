import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const API_BASE = getPublicApiUrl();
const OPS_KEY_STORAGE = "sentinel-ops-key";

export default function ArchitectAgent() {
  const [opsKey, setOpsKey] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Sentinel Senior Architect Agent online (ops-only — not shown to app users).\n\nI analyze internal telemetry: calibration, rules, and signal quality. Raw metrics can look harsh; cross-check definitions in Ops → Signals before changing production gates.\n\nWhat should we inspect?"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(true);
  const scrollContainerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const readKey = () => {
      try {
        setOpsKey(localStorage.getItem(OPS_KEY_STORAGE) || null);
      } catch {
        setOpsKey(null);
      }
    };
    readKey();
    const onStorage = (event) => {
      if (event.key === OPS_KEY_STORAGE) readKey();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, loading]);

  const clearHistory = () => {
    setMessages([{ role: "assistant", content: "History cleared. Context refreshed. Ready." }]);
    setError(null);
  };

  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading || !opsKey) return;

    const userMessage = { role: "user", content: msg };
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/ops/agent/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ops-key": opsKey
        },
        body: JSON.stringify({ message: msg, history })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || `Agent error (${response.status})`);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "No answer returned.",
          model: data.model || null
        }
      ]);
    } catch (err) {
      setError(`Connection error: ${err.message}`);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 50);
    }
  }, [input, loading, messages, opsKey]);

  const handleKey = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  if (!opsKey) return null;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 100%)",
        border: "1px solid #1a2a1a",
        borderRadius: "12px",
        overflow: "hidden",
        overscrollBehavior: "contain",
        display: "flex",
        flexDirection: "column",
        height: isOpen ? "520px" : "48px",
        transition: "height 0.3s ease",
        boxShadow: "0 0 40px rgba(0, 255, 100, 0.04), 0 2px 24px rgba(0,0,0,0.6)"
      }}
    >
      <div
        onClick={() => setIsOpen((open) => !open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: "48px",
          background: "linear-gradient(90deg, #0f1f0f 0%, #111820 100%)",
          borderBottom: isOpen ? "1px solid #1a2a1a" : "none",
          cursor: "pointer",
          userSelect: "none",
          flexShrink: 0
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#00ff64",
              boxShadow: "0 0 8px #00ff64"
            }}
          />
          <span
            style={{
              color: "#00ff64",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              fontFamily: "monospace"
            }}
          >
            SENTINEL ARCHITECT AGENT
          </span>
          <span style={{ color: "#3a5a3a", fontSize: "10px", fontFamily: "monospace" }}>
            OPS CONSOLE
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isOpen && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                clearHistory();
              }}
              style={{
                background: "none",
                border: "1px solid #1a2a1a",
                color: "#4a6a4a",
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "4px",
                cursor: "pointer",
                fontFamily: "monospace"
              }}
            >
              CLEAR
            </button>
          )}
          <span style={{ color: "#3a5a3a", fontSize: "12px" }}>{isOpen ? "v" : "^"}</span>
        </div>
      </div>

      {isOpen && (
        <>
          <div
            ref={scrollContainerRef}
            style={{
              flex: 1,
              overflowY: "auto",
              overscrollBehavior: "contain",
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}
          >
            <p
              style={{
                margin: 0,
                padding: "8px 10px",
                fontSize: "11px",
                lineHeight: 1.45,
                color: "#6a8a6a",
                fontFamily: "monospace",
                background: "rgba(0,255,100,0.04)",
                border: "1px solid rgba(0,255,100,0.12)",
                borderRadius: "8px"
              }}
            >
              Internal ops assistant only — customers never see this. AI replies use raw backend stats; confirm KPI meanings under Signals before acting.
            </p>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: message.role === "user" ? "flex-end" : "flex-start"
                }}
              >
                <div
                  style={{
                    maxWidth: "92%",
                    background:
                      message.role === "user"
                        ? "rgba(0, 255, 100, 0.07)"
                        : "rgba(255, 255, 255, 0.03)",
                    border:
                      message.role === "user"
                        ? "1px solid rgba(0, 255, 100, 0.15)"
                        : "1px solid rgba(255,255,255,0.06)",
                    borderRadius:
                      message.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    padding: "10px 14px",
                    color: message.role === "user" ? "#a0ffc0" : "#d0d8d0",
                    fontSize: "13px",
                    lineHeight: "1.6",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word"
                  }}
                >
                  {message.content}
                </div>
                {message.model && (
                  <span
                    style={{
                      color: "#2a4a2a",
                      fontSize: "10px",
                      marginTop: "3px",
                      fontFamily: "monospace"
                    }}
                  >
                    {message.model}
                  </span>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "12px 12px 12px 2px",
                    padding: "10px 14px",
                    color: "#3a6a3a",
                    fontSize: "13px",
                    fontFamily: "monospace"
                  }}
                >
                  analyzing...
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  background: "rgba(255, 50, 50, 0.06)",
                  border: "1px solid rgba(255,50,50,0.2)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "#ff6060",
                  fontSize: "12px",
                  fontFamily: "monospace"
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid #1a2a1a",
              padding: "10px 12px",
              display: "flex",
              gap: "8px",
              background: "#0a0a0f",
              flexShrink: 0
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask the architect... (Enter to send, Shift+Enter for newline)"
              disabled={loading}
              rows={1}
              style={{
                flex: 1,
                background: "rgba(0, 255, 100, 0.03)",
                border: "1px solid #1a2a1a",
                borderRadius: "8px",
                padding: "8px 12px",
                color: "#a0ffc0",
                fontSize: "13px",
                fontFamily: "monospace",
                resize: "none",
                outline: "none",
                minHeight: "36px",
                maxHeight: "120px"
              }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? "#1a2a1a" : "rgba(0, 255, 100, 0.12)",
                border: `1px solid ${loading || !input.trim() ? "#1a2a1a" : "#00ff64"}`,
                borderRadius: "8px",
                color: loading || !input.trim() ? "#2a4a2a" : "#00ff64",
                padding: "0 16px",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                fontSize: "12px",
                fontWeight: 700,
                fontFamily: "monospace",
                letterSpacing: "0.05em",
                minWidth: "64px"
              }}
            >
              {loading ? "..." : "SEND"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
