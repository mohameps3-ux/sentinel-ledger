import { useState } from "react";
import { useRouter } from "next/router";
import { ProButton } from "../components/ui/ProButton";
import { PageHead } from "../components/seo/PageHead";
import { useTrendingTokens } from "../hooks/useTrendingTokens";

const NARRATIVE_OPTIONS = ["ALL", "AI", "DeFi", "Gaming", "Meme", "RWA", "L2", "Dog", "Cat"];

export default function ScannerPage() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [narrative, setNarrative] = useState("ALL");
  const router = useRouter();
  const trending = useTrendingTokens([], {}, narrative === "ALL" ? "" : narrative);

  const onSubmit = (e) => {
    e.preventDefault();
    const v = address.trim();
    if (v.length < 32 || v.length > 64) {
      setError("Paste a valid Solana mint (32-64 chars).");
      return;
    }
    setError("");
    router.push(`/token/${v}`);
  };

  return (
    <>
      <PageHead
        title="Solana Token Scanner — Sentinel Ledger"
        description="Analyze any Solana token: cluster heat, smart money flow, and entry signal."
      />
    <div className="sl-container py-10">
      <section className="sl-scan-hero sl-inset max-w-3xl mx-auto sm:p-8">
        <p className="sl-label text-violet-300/90">Scanner</p>
        <h1 className="sl-h2 text-white mt-1">One-click token scan</h1>
        <p className="sl-body sl-muted mt-2">
          Paste any Solana mint. Sentinel opens a full Decision Engine breakdown with score, red flags, and live flow.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="So11111111111111111111111111111111111111112"
            className="sl-input h-12"
          />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <ProButton type="submit">Scan token</ProButton>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => router.push("/")}
            >
              Back to dashboard
            </button>
          </div>
        </form>
      </section>

      <section className="mt-8 glass-card sl-inset max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="sl-label">Narrative Scanner</p>
            <h2 className="text-white font-semibold text-lg mt-1">Show me only specific narratives</h2>
          </div>
          <select
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            className="sl-input h-10 max-w-[220px]"
          >
            {NARRATIVE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(trending.data?.data || []).slice(0, 12).map((token) => (
            <button
              key={token.tokenAddress}
              type="button"
              onClick={() => router.push(`/token/${token.tokenAddress}`)}
              className="text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{token.token || token.symbol || "TOKEN"}</p>
                <p className="text-xs text-emerald-300">{Number(token.sentinelScore || 0)}/100</p>
              </div>
              <p className="mono text-[11px] text-gray-500 mt-1">
                {String(token.tokenAddress || "").slice(0, 6)}...{String(token.tokenAddress || "").slice(-6)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(token.narrativeTags || []).slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}
