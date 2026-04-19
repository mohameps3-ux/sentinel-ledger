import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchWalletNarrative } from "../lib/api/walletNarrative";

export function WalletNarrativeCard({ walletAddress, lang = "es" }) {
  const query = useQuery({
    queryKey: ["wallet-narrative", walletAddress, lang],
    queryFn: () => fetchWalletNarrative(walletAddress, lang),
    enabled: Boolean(walletAddress),
    staleTime: 30 * 60 * 1000
  });

  if (query.isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-gray-400 inline-flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" />
        Generando narrativa...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-xs text-red-200">
        No se pudo generar narrativa ({query.error?.message || "error"}).
      </div>
    );
  }

  const payload = query.data || {};
  const narrative = payload.narrative || {};
  const sentences = Array.isArray(narrative.sentences) ? narrative.sentences : [];
  const tags = Array.isArray(narrative.highlight_tags) ? narrative.highlight_tags : [];

  return (
    <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.08] px-3 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-violet-100">{narrative.headline || "Narrativa de wallet"}</p>
        <span className="text-[10px] text-violet-200/80">{payload.cached ? "cache" : "live"}</span>
      </div>
      <ul className="space-y-1.5">
        {sentences.map((line) => (
          <li key={line} className="text-xs text-gray-200 leading-relaxed">
            - {line}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-violet-100">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

