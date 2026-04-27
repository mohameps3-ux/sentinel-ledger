import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { getPublicApiUrl } from "../../lib/publicRuntime";

/**
 * In-app support + “Ask Sentinel” widget (client-only; loaded via dynamic( ssr: false )).
 */
export function SentinelBot() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("support");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [messages, setMessages] = useState([]);
  const endRef = useRef(null);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  const send = useCallback(
    async (text) => {
      const trimmed = String(text || "").trim();
      if (!trimmed || loading) return;
      setLoading(true);
      const userMsg = { role: "user", text: trimmed, id: `u-${Date.now()}` };
      setMessages((m) => [...m, userMsg]);
      setInput("");
      try {
        const res = await fetch(`${getPublicApiUrl()}/api/v1/bot/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            language: "es",
            sessionId: "",
            uiMode: mode === "ask" ? "ask" : "support"
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "request_failed");
        }
        if (!openRef.current) {
          setUnread((n) => n + 1);
        }
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            text: data.answer,
            id: `b-${Date.now()}`,
            thumbsId: data.thumbsId,
            source: data.source,
            meta: { intent: data.intent, cached: data.cached }
          }
        ]);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            text: "No se pudo conectar con el asistente. Revisa la conexión o inténtalo más tarde.",
            id: `b-err-${Date.now()}`,
            error: true
          }
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, mode]
  );

  const onSubmit = (e) => {
    e.preventDefault();
    void send(input);
  };

  const onThumb = async (thumbsId, vote) => {
    if (!thumbsId) return;
    try {
      await fetch(`${getPublicApiUrl()}/api/v1/bot/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbsId, vote })
      });
    } catch {
      // silent
    }
  };

  const quick = (q) => () => void send(q);

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-2 pointer-events-auto">
      {open ? (
        <div
          className="w-[360px] h-[480px] max-w-[calc(100vw-1.5rem)] flex flex-col bg-sl-panel border border-sl-border rounded-lg overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          role="dialog"
          aria-label="Sentinel Assistant"
        >
          <div className="shrink-0 border-b border-sl-border px-3 py-2 flex items-center justify-between gap-2 bg-sl-card/80">
            <div>
              <div className="font-mono text-xs text-sl-muted uppercase tracking-wider">SENTINEL ASSISTANT</div>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => setMode("support")}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                    mode === "support" ? "bg-sl-violet/20 text-sl-violet border border-sl-violet/50" : "text-sl-muted border border-transparent"
                  }`}
                >
                  SUPPORT
                </button>
                <button
                  type="button"
                  onClick={() => setMode("ask")}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                    mode === "ask" ? "bg-sl-violet/20 text-sl-violet border border-sl-violet/50" : "text-sl-muted border border-transparent"
                  }`}
                >
                  ASK SENTINEL
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-md border border-sl-border text-sl-muted hover:text-white hover:border-sl-violet/50 transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2">
            {messages.length === 0 && !loading ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-sl-muted font-mono px-1">
                  {mode === "support" ? "Soporte y cuenta." : "Preguntas sobre señales, score y contexto de mercado."}
                </p>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={quick("¿Qué es el Score?")}
                    className="text-left text-xs py-1.5 px-2 rounded border border-sl-border bg-sl-card hover:border-sl-violet/40"
                  >
                    ¿Qué es el Score?
                  </button>
                  <button
                    type="button"
                    onClick={quick("No veo señales")}
                    className="text-left text-xs py-1.5 px-2 rounded border border-sl-border bg-sl-card hover:border-sl-violet/40"
                  >
                    No veo señales
                  </button>
                  <button
                    type="button"
                    onClick={quick("Quiero activar PRO o ver precios")}
                    className="text-left text-xs py-1.5 px-2 rounded border border-sl-border bg-sl-card hover:border-sl-violet/40"
                  >
                    Activar PRO
                  </button>
                </div>
              </div>
            ) : null}
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-1"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[88%] rounded-lg px-2.5 py-1.5 text-sm bg-sl-violet text-white font-medium"
                      : "max-w-[92%] rounded-lg px-2.5 py-1.5 text-sm border border-sl-border bg-sl-card text-slate-100"
                  }
                >
                  {m.text}
                </div>
                {m.role === "bot" && !m.error && m.thumbsId ? (
                  <div className="flex items-center gap-1 pl-0.5">
                    <button
                      type="button"
                      onClick={() => onThumb(m.thumbsId, "up")}
                      className="p-0.5 rounded text-slate-400 hover:text-emerald-400"
                      aria-label="Útil"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onThumb(m.thumbsId, "down")}
                      className="p-0.5 rounded text-slate-400 hover:text-rose-400"
                      aria-label="No útil"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-0.5 pl-1 py-1" aria-hidden>
                <span className="w-1.5 h-1.5 rounded-full bg-sl-violet/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-sl-violet/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-sl-violet/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="shrink-0 border-t border-sl-border p-2 flex gap-1.5 bg-sl-card/80">
            <input
              className="flex-1 min-w-0 rounded-md border border-sl-border bg-[#0a0a0a] text-sm text-white placeholder:text-slate-500 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sl-violet/50"
              placeholder="Escribe tu pregunta..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-sl-border bg-sl-violet text-black disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="relative w-12 h-12 flex items-center justify-center rounded-full bg-sl-card border border-sl-border shadow-lg hover:border-sl-violet/50 transition-colors"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente"}
        aria-expanded={open}
      >
        <MessageCircle className="w-5 h-5 text-sl-violet" strokeWidth={2} />
        {!open && unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
    </div>
  );
}
