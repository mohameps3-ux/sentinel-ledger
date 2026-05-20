import { useMemo } from "react";
import { useMarketStore } from "@/lib/store/marketStore";
import { narrativeFromData } from "@/lib/narrativeFromData";
import { TokenCardAvatar } from "./TokenCardAvatar";

function tokenMint(tok) {
  return tok?.mint ?? tok?.address ?? tok?.tokenAddress ?? "";
}

function tokenSymbol(tok) {
  const mint = tokenMint(tok);
  return tok?.symbol ?? tok?.name ?? (mint ? mint.slice(0, 8) : "TOKEN");
}

function tokenScore(tok) {
  const n = Number(tok?._currentScore ?? tok?.sentinelScore ?? tok?.score ?? tok?.unified_score ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function intentClass(score) {
  if (score >= 85) return "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]";
  if (score >= 70) return "bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.35)]";
  if (score >= 50) return "bg-blue-300 shadow-[0_0_10px_rgba(147,197,253,0.3)]";
  return "bg-zinc-500";
}

function scoreTone(score) {
  if (score >= 85) return "text-emerald-300 border-emerald-500/25 bg-emerald-500/10";
  if (score >= 70) return "text-amber-200 border-amber-500/25 bg-amber-500/10";
  if (score >= 50) return "text-blue-200 border-blue-500/25 bg-blue-500/10";
  return "text-sl-muted border-white/10 bg-white/[0.03]";
}

function RecentSignalNarrative({ token }) {
  const mint = tokenMint(token);
  const narrativeEntry = useMarketStore((s) => (mint ? s.narratives.get(mint) : undefined));
  const line = useMemo(() => {
    const live = narrativeEntry?.message;
    if (live != null && live !== "") return String(live);
    const whyNow = Array.isArray(token?.whyNowBulletLines) ? token.whyNowBulletLines[0] : null;
    if (whyNow != null && whyNow !== "") return String(whyNow);
    return narrativeFromData({
      ...token,
      _currentScore: token?._currentScore ?? token?.sentinelScore ?? token?.score ?? 0
    });
  }, [narrativeEntry?.message, token]);

  return <span className="truncate text-[11px] text-sl-sub">{line}</span>;
}

export function RecentSignalsPanel({ tokens = [], selectedMint, onSelectMint, maxItems = 10 }) {
  const rows = useMemo(() => {
    return (tokens || [])
      .filter((tok) => tokenMint(tok))
      .slice(0, maxItems);
  }, [tokens, maxItems]);

  if (!rows.length) return null;

  return (
    <section className="mt-3 border border-white/10 bg-zinc-900/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-sl-muted">
            Recent Signals
          </p>
          <h3 className="mt-1 text-sm font-semibold tracking-tight text-sl-text">
            Velocity tape
          </h3>
        </div>
        <p className="text-[10px] text-sl-muted">
          {rows.length} latest velocity tokens
        </p>
      </div>

      <div className="max-h-[320px] overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {rows.map((tok, idx) => {
            const mint = tokenMint(tok);
            const symbol = tokenSymbol(tok);
            const score = tokenScore(tok);
            const isActive = Boolean(selectedMint && mint === selectedMint);
            const clickable = typeof onSelectMint === "function";
            return (
              <button
                key={`${mint}-${idx}`}
                type="button"
                disabled={!clickable}
                onClick={() => {
                  if (!clickable) return;
                  onSelectMint(mint);
                }}
                className={`group flex w-full items-center gap-2 border px-2.5 py-2 text-left transition-all ${
                  isActive
                    ? "border-violet-400/45 bg-violet-500/[0.12]"
                    : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.045]"
                } ${clickable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${intentClass(score)}`} />
                <TokenCardAvatar tokenLike={tok} mint={mint} size={28} variant="neutral" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-semibold text-sl-text">
                      ${symbol}
                    </span>
                    {isActive ? (
                      <span className="shrink-0 border border-violet-400/30 bg-violet-500/10 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-violet-100">
                        active
                      </span>
                    ) : null}
                  </div>
                  <RecentSignalNarrative token={tok} />
                </div>
                <span className={`shrink-0 border px-2 py-1 font-mono text-[10px] font-semibold ${scoreTone(score)}`}>
                  {score}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
