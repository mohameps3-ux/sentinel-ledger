import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const OPS_KEY_STORAGE = "sentinel-ops-key";

/**
 * ArchitectAgent — Sentinel Senior Architect Agent.
 * Renders exclusively in the ops console.
 * Reads ops key from localStorage automatically (same key as withOpsBridge).
 */
export default function ArchitectAgent() {
  const [opsKey, setOpsKey] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Sentinel Senior Architect Agent online.\n\nI have full access to your engine state, calibration data, rule performance, and signal quality. What do you need to analyze?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Read ops key from localStorage (same source as withOpsBridge)
  useEffect(() => {
    const k = localStorage.getItem(OPS_KEY_STORAGE);
    setOpsKey(k || null);
    // Re-read if it changes
    const onStorage = (e) => {
      if (e.key === OPS_KEY_STORAGE) setOpsKey(e.newValue || null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading || !opsKey) return;

    const userMsg = { role: "user", content: msg };
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/ops/agent/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ops-key": opsKey,
        },
        body: JSON.stringify({ message: msg, history }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Agent error (" + res.status + ")");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, model: data.model },
      ]);
    } catch (err) {
      setError("Connection error: " + err.message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, opsKey, messages]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = () => {
    setMessages([
      {
        role: "assistant",
        content: "History cleared. Context refreshed. Ready.",
      },
    ]);
    setError(null);
  };

  // Don't render if no key available
  if (!opsKey) return null;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 100%)",
        border: "1px solid #1a2a1a",
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: isOpen ? "520px" : "48px",
        transition: "height 0.3s ease",
        boxShadow: "0 0 40px rgba(0, 255, 100, 0.04), 0 2px 24px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setIsOpen((o) => !o)}
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
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#00ff64",
              boxShadow: "0 0 8px #00ff64",
              animation: loading ? "pulse 1s infinite" : "none",
            }}
          />
          <span style={{ color: "#00ff64", fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", fontFamily: "monospace" }}>
            SENTINEL ARCHITECT AGENT
          </span>
          <span style={{ color: "#3a5a3a", fontSize: "10px", fontFamily: "monospace" }}>
            OPS CONSOLE
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); clearHistory(); }}
              style={{
                background: "none", border: "1px solid #1a2a1a", color: "#4a6a4a",
                fontSize: "10px", padding: "2px 8px", borderRadius: "4px",
                cursor: "pointer", fontFamily: "monospace",
              }}
            >
              CLEAR
            </button>
          )}
          <span style={{ color: "#3a5a3a", fontSize: "12px" }}>{isOpen ? "▼" : "▲"}</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "92%",
                background: m.role === "user" ? "rgba(0, 255, 100, 0.07)" : "rgba(255, 255, 255, 0.03)",
                border: m.role === "user" ? "1px solid rgba(0, 255, 100, 0.15)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                padding: "10px 14px",
                color: m.role === "user" ? "#a0ffc0" : "#d0d8d0",
                fontSize: "13px", lineHeight: "1.6", fontFamily: "monospace",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}
            >
              {m.content}
            </div>
            {m.model && (
              <span style={{ color: "#2a4a2a", fontSize: "10px", marginTop: "3px", fontFamily: "monospace" }}>
                {m.model}
              </span>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px 12px 12px 2px", padding: "10px 14px", color: "#3a6a3a", fontSize: "13px", fontFamily: "monospace" }}>
              analyzing...
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(255, 50, 50, 0.06)", border: "1px solid rgba(255,50,50,0.2)", borderRadius: "8px", padding: "8px 12px", color: "#ff6060", fontSize: "12px", fontFamily: "monospace" }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: "1px solid #1a2a1a", padding: "10px 12px", display: "flex", gap: "8px", background: "#0a0a0f", flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask the architect... (Enter to send)"
          disabled={loading}
          rows={1}
          style={{
            flex: 1, background: "rgba(0, 255, 100, 0.03)", border: "1px solid #1a2a1a",
            borderRadius: "8px", padding: "8px 12px", color: "#a0ffc0",
            fontSize: "13px", fontFamily: "monospace", resize: "none", outline: "none",
            minHeight: "36px", maxHeight: "120px",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? "#1a2a1a" : "rgba(0, 255, 100, 0.12)",
            border: "1px solid " + (loading || !input.trim() ? "#1a2a1a" : "#00ff64"),
            borderRadius: "8px",
            color: loading || !input.trim() ? "#2a4a2a" : "#00ff64",
            padding: "0 16px", cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            fontSize: "12px", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em",
            transition: "all 0.2s", minWidth: "64px",
          }}
        >
          {loading ? "..." : "SEND"}
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
  }import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * ArchitectAgent — Sentinel Senior Architect Agent chat panel.
 * Renders ONLY in the ops console. Requires ops key to function.
 * Never shown to end users.
 */
export default function ArchitectAgent() {   const opsKey = typeof window !== "undefined" ? localStorage.getItem("sentinel-ops-key") : null;
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Sentinel Senior Architect Agent online. I have full visibility into your engine state, calibration data, rule performance, and signal quality.\n\nWhat do you want to analyze?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading || !opsKey) return;

    const userMsg = { role: "user", content: msg };
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/ops/agent/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ops-key": opsKey,
        },
        body: JSON.stringify({ message: msg, history }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Agent error");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, model: data.model },
      ]);
    } catch (err) {
      setError("Connection error — " + err.message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, opsKey, messages]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = () => {
    setMessages([
      {
        role: "assistant",
        content: "History cleared. Context refreshed. What do you need?",
      },
    ]);
    setError(null);
  };

  if (!opsKey) return null;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 100%)",
        border: "1px solid #1a2a1a",
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: isOpen ? "520px" : "48px",
        transition: "height 0.3s ease",
        boxShadow: "0 0 40px rgba(0, 255, 100, 0.04), 0 2px 24px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setIsOpen((o) => !o)}
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
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#00ff64",
              boxShadow: "0 0 8px #00ff64",
              animation: loading ? "pulse 1s infinite" : "none",
            }}
          />
          <span
            style={{
              color: "#00ff64",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              fontFamily: "monospace",
            }}
          >
            SENTINEL ARCHITECT AGENT
          </span>
          <span
            style={{
              color: "#3a5a3a",
              fontSize: "10px",
              fontFamily: "monospace",
            }}
          >
            OPS ONLY
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); clearHistory(); }}
              style={{
                background: "none",
                border: "1px solid #1a2a1a",
                color: "#4a6a4a",
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "4px",
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              CLEAR
            </button>
          )}
          <span style={{ color: "#3a5a3a", fontSize: "12px" }}>
            {isOpen ? "▼" : "▲"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "92%",
                background:
                  m.role === "user"
                    ? "rgba(0, 255, 100, 0.07)"
                    : "rgba(255, 255, 255, 0.03)",
                border:
                  m.role === "user"
                    ? "1px solid rgba(0, 255, 100, 0.15)"
                    : "1px solid rgba(255,255,255,0.06)",
                borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                padding: "10px 14px",
                color: m.role === "user" ? "#a0ffc0" : "#d0d8d0",
                fontSize: "13px",
                lineHeight: "1.6",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.content}
            </div>
            {m.model && (
              <span style={{ color: "#2a4a2a", fontSize: "10px", marginTop: "3px", fontFamily: "monospace" }}>
                {m.model}
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
                fontFamily: "monospace",
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
              fontFamily: "monospace",
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: "1px solid #1a2a1a",
          padding: "10px 12px",
          display: "flex",
          gap: "8px",
          background: "#0a0a0f",
          flexShrink: 0,
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
