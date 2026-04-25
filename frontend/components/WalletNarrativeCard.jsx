import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchWalletNarrative } from "../lib/api/walletNarrative";
import { useT } from "../lib/i18n";

const TAG_CLASS = {
  early_buyer: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  rug_avoider: "border-blue-400/40 bg-blue-500/10 text-blue-200",
  high_winrate: "border-indigo-400/40 bg-indigo-500/10 text-indigo-200",
  biggest_win: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  activity_spike: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  patient_holder: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
  insufficient_history: "border-white/15 bg-white/[0.04] text-gray-300"
};

export function WalletNarrativeCard({ walletAddress, lang = "es" }) {
  const tr = useT(lang);
  const query = useQuery({
    queryKey: ["wallet-narrative", walletAddress, lang],
    queryFn: () => fetchWalletNarrative(walletAddress, lang),
    enabled: Boolean(walletAddress),
    staleTime: 30 * 60 * 1000
  });

  if (query.isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#080b10]/80 px-4 py-4 space-y-3">
        <div className="inline-flex items-center gap-2 text-sm text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          {tr("wallet.narrative.loading")}
        </div>
        <div className="h-4 w-2/3 rounded bg-white/[0.06] animate-pulse" />
        <div className="h-3 w-full rounded bg-white/[0.04] animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-white/[0.04] animate-pulse" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-xs text-red-200">
        {tr("wallet.narrative.errorTitle")} ({query.error?.message || "error"}).
      </div>
    );
  }

  const payload = query.data || {};
  const narrative = payload.narrative || payload || {};
  const sentences = Array.isArray(payload.sentences)
    ? payload.sentences
    : Array.isArray(narrative.sentences)
      ? narrative.sentences
      : [];
  const tags = Array.isArray(payload.highlight_tags)
    ? payload.highlight_tags
    : Array.isArray(narrative.highlight_tags)
      ? narrative.highlight_tags
      : [];
  const headline = payload.headline || narrative.headline || tr("wallet.narrative.headlineFallback");

  return (
    <div className="rounded-xl border border-violet-500/25 bg-[#080b10]/90 px-4 py-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-white tracking-tight">
          {headline}
        </p>
        <span className="text-[10px] text-violet-200/75 font-mono uppercase tracking-[0.14em]">
          {payload.cached ? tr("common.cache") : tr("common.live")}
        </span>
      </div>
      <ul className="space-y-1.5">
        {sentences.map((line) => (
          <li key={line} className="text-xs text-gray-200 leading-relaxed">
            <span className="text-violet-300">›</span> {line}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${TAG_CLASS[tag] || "border-violet-400/30 bg-violet-500/10 text-violet-100"}`}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
