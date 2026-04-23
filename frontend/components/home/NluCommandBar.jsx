import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Command, Loader2, Search, Sparkles, X } from "lucide-react";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const FALLBACK =
  "I didn't understand that. Try: price of SOL, signal on WIF, analyze wallet [address], swap 1 SOL to USDC";

function formatResult(res) {
  if (!res?.ok) return res?.error || FALLBACK;
  const d = res.data || {};
  if (res.intent === "GET_PRICE") {
    return [
      `${d.symbol || "TOKEN"} · $${Number(d.priceUsd || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}`,
      `24h ${Number(d.change24h || 0) >= 0 ? "+" : ""}${Number(d.change24h || 0).toFixed(2)}% · Volume $${Number(
        d.volume24h || 0
      ).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    ].join("\n");
  }
  if (res.intent === "GET_SIGNAL") {
    return `Signal ${d.symbol || "TOKEN"} · Strength ${Math.round(Number(d.signalStrength || 0))}/100 · ${d.suggestedAction} · Confidence ${Math.round(Number(d.confidence || 0))}%`;
  }
  if (res.intent === "GET_WALLET") {
    return `Wallet ${String(d.wallet || "").slice(0, 4)}…${String(d.wallet || "").slice(-4)} · Win rate ${Number(
      d.winRate || 0
    ).toFixed(1)}% · ROI ${Number(d.roi30d || 0).toFixed(1)}% · Risk ${d.riskProfile || "N/A"}`;
  }
  if (res.intent === "GET_SWAP_QUOTE") {
    return `Swap quote · ${d.inputAmount} in -> ${Number(d.outputAmount || 0).toLocaleString("en-US", {
      maximumFractionDigits: 6
    })} out · Impact ${Number(d.priceImpactPct || 0).toFixed(3)}%`;
  }
  return "Done.";
}

export function NluCommandBar() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [openMobile, setOpenMobile] = useState(false);
  const workerRef = useRef(null);
  const inlineInputRef = useRef(null);
  const sheetInputRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const worker = new Worker(new URL("../../workers/nlu-worker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (e) => {
      setIsLoading(false);
      setResult(e.data || null);
    };
    worker.onerror = () => {
      setIsLoading(false);
      setResult({ ok: false, error: FALLBACK, intent: "UNKNOWN" });
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
          setOpenMobile(true);
          setTimeout(() => sheetInputRef.current?.focus(), 40);
        } else {
          inlineInputRef.current?.focus();
          inlineInputRef.current?.select();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const examples = useMemo(
    () => ["price of SOL", "signal on WIF", "analyze wallet <address>", "swap 1 SOL to USDC"],
    []
  );

  const submit = (rawText) => {
    const text = String(rawText || query || "").trim();
    if (!text || !workerRef.current) return;
    setIsLoading(true);
    workerRef.current.postMessage({
      query: text,
      apiBaseUrl: getPublicApiUrl()
    });
  };

  return (
    <>
      <section className="sl-section !pt-0 !pb-0">
        <div className="glass-card sl-glow-info sl-inset border border-cyan-500/25 bg-cyan-500/[0.04] !p-1.5 sm:!p-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="inline-flex items-center gap-2">
              <Sparkles size={14} className="text-cyan-300" />
              <p className="sl-label text-cyan-200">Sentinel NLU command bar</p>
            </div>
            <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
              <Command size={12} />
              CTRL/CMD + K
            </span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(query);
            }}
            className="flex gap-1"
          >
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                ref={inlineInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask Sentinel anything..."
                className="sl-input w-full h-7 pl-6.5 pr-2 text-[11px]"
              />
            </div>
            <button
              type="submit"
              className="btn-pro h-7 px-2.5 text-[11px] inline-flex items-center justify-center"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : "Run"}
            </button>
          </form>
          <div className="mt-0.5 text-[9px] text-gray-500 truncate">Try: {examples.join(" · ")}</div>
          {result ? (
            <div className="mt-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2 whitespace-pre-line text-xs text-gray-200 leading-snug">
              {formatResult(result)}
            </div>
          ) : null}
        </div>
      </section>

      <button
        type="button"
        onClick={() => {
          setOpenMobile(true);
          setTimeout(() => sheetInputRef.current?.focus(), 40);
        }}
        className="md:hidden fixed right-4 bottom-24 z-40 h-12 px-4 rounded-full border border-cyan-400/35 bg-[#0d1117]/95 text-cyan-200 inline-flex items-center gap-2 shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
      >
        <Bot size={16} />
        Ask Sentinel
      </button>

      {openMobile ? (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-white/10 bg-[#0b0b0e] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Ask Sentinel anything</p>
              <button type="button" onClick={() => setOpenMobile(false)} className="text-gray-400 p-1">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(query);
              }}
              className="flex gap-2"
            >
              <input
                ref={sheetInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="price of SOL / señal en BONK / swap 1 SOL to USDC"
                className="sl-input h-10 flex-1 px-3"
              />
              <button type="submit" className="btn-pro h-10 px-4" disabled={isLoading}>
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : "Run"}
              </button>
            </form>
            {result ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 whitespace-pre-line text-sm text-gray-200 leading-relaxed">
                {formatResult(result)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

