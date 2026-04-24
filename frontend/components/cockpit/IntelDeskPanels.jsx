import { memo, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { BarChart3, ExternalLink, Radar } from "lucide-react";
import { SmartMoneyPanel } from "../token/SmartMoneyPanel";
import { WalletThreatBanner } from "../token/WalletThreatBanner";
import { buildJupiterSwapUrl } from "../../lib/jupiterSwap";
import { formatUsdWhole } from "../../lib/formatStable";
import { isProbableSolanaMint } from "../../lib/solanaMint.mjs";
import { mergeDeskMintIntoQuery } from "../../lib/deskRadarCtx.mjs";
import { useLocale } from "../../contexts/LocaleContext";

/** @param {object | null | undefined} token Token payload from `useTokenData().data?.data` */
export function deskAntiSummaryTone(token) {
  if (!token) return "neutral";
  const wi = token.walletIntel;
  if (wi?.level === "high") return "critical";
  if (wi?.level === "medium") return "warn";
  const cons = token.analysis?.cons;
  if (Array.isArray(cons) && cons.length) {
    const joined = cons.join(" ").toLowerCase();
    if (/\b(mint authority|freeze authority|honeypot|blacklist|unlocked|mutable)\b/i.test(joined)) return "critical";
    if (cons.length >= 2) return "warn";
  }
  const g = String(token.analysis?.grade || "");
  if (g === "D" || g === "F") return "warn";
  return "neutral";
}

export const DeskJupiterLinks = memo(function DeskJupiterLinks({ mint }) {
  if (!mint || !isProbableSolanaMint(mint)) {
    return <p className="text-xs text-gray-500">Invalid mint — cannot build swap links.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500 leading-relaxed">Pre-sized SOL → token on Jupiter (new tab).</p>
      <div className="flex flex-wrap gap-1.5">
        {[0.5, 1, 5].map((size) => (
          <a
            key={size}
            href={buildJupiterSwapUrl(mint, size)}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] px-2 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 font-mono inline-flex items-center gap-1"
          >
            {size} SOL
            <ExternalLink size={10} className="opacity-70" />
          </a>
        ))}
      </div>
      <a
        href={`https://jup.ag/swap/SOL-${mint}`}
        target="_blank"
        rel="noreferrer"
        className="text-[11px] text-cyan-300/90 hover:underline inline-flex items-center gap-1"
      >
        Open Jupiter for this mint →
      </a>
    </div>
  );
});

export const DeskSmartMoneyLazy = memo(function DeskSmartMoneyLazy({ mint, flaggedWallets }) {
  if (!mint) return <p className="text-xs text-gray-500">No mint.</p>;
  return (
    <div className="min-w-0">
      <SmartMoneyPanel tokenAddress={mint} flaggedWallets={flaggedWallets} />
    </div>
  );
});

export const DeskAntiSignalBody = memo(function DeskAntiSignalBody({ token }) {
  if (!token) {
    return <p className="text-xs text-gray-500">Load token intel to evaluate red flags.</p>;
  }
  const wi = token.walletIntel;
  const cons = token.analysis?.cons;
  return (
    <div className="space-y-3">
      {wi && wi.level !== "none" ? <WalletThreatBanner walletIntel={wi} /> : null}
      {Array.isArray(cons) && cons.length ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-red-400/90 font-semibold mb-1">Structural cons</p>
          <ul className="text-[11px] text-gray-300 space-y-1 list-none">
            {cons.slice(0, 8).map((c, i) => (
              <li key={i} className="border-l border-red-500/30 pl-2">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!wi || wi.level === "none" ? (
        !cons?.length ? (
          <p className="text-xs text-gray-500">No elevated wallet threats or listed cons for this mint.</p>
        ) : null
      ) : null}
    </div>
  );
});

export const DeskQuickScan = memo(function DeskQuickScan({ currentMint }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const trimmed = raw.trim();
  const canGo = isProbableSolanaMint(trimmed);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!canGo) return;
    const nextQuery = mergeDeskMintIntoQuery(router.query, trimmed, null);
    void router.push({ pathname: router.pathname || "/", query: nextQuery }, undefined, { shallow: true });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <p className="text-[10px] sm:text-[11px] text-gray-500 leading-snug sm:leading-relaxed truncate sm:whitespace-normal" title="Paste a Solana mint to pin the desk (shallow ?t=).">
        Paste a Solana mint to pin the desk (shallow <span className="font-mono text-gray-400">?t=</span>).
      </p>
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Token mint…"
        className="w-full rounded-md border border-white/12 bg-black/30 px-2 py-1.5 sm:px-2.5 sm:py-2 text-[11px] sm:text-xs font-mono text-gray-100 placeholder:text-gray-600"
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!canGo}
          className={`text-[11px] sm:text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg border font-semibold ${
            canGo
              ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25"
              : "border-white/10 text-gray-600 cursor-not-allowed"
          }`}
        >
          Pin on desk
        </button>
        {currentMint && isProbableSolanaMint(currentMint) ? (
          <Link href={`/token/${currentMint}`} className="text-[11px] text-emerald-300/90 hover:underline">
            Full terminal →
          </Link>
        ) : null}
      </div>
      {trimmed.length >= 20 && !canGo ? (
        <p className="text-[10px] text-amber-200/90">Does not look like a valid Solana mint (length / charset).</p>
      ) : null}
    </form>
  );
});

export const DeskContextStrip = memo(function DeskContextStrip({ token }) {
  const m = token?.market;
  const sym = token?.symbol || "—";
  const vol = m?.volume24hUsd != null ? formatUsdWhole(m.volume24hUsd) : null;
  const liq = m?.liquidityUsd != null ? formatUsdWhole(m.liquidityUsd) : null;
  return (
    <div className="flex flex-wrap gap-3 text-[10px] text-gray-400 border border-white/[0.06] rounded-md px-2 py-1.5 bg-white/[0.02]">
      <span className="inline-flex items-center gap-1 text-gray-200">
        <Radar size={12} className="text-purple-300 shrink-0" />
        {sym}
      </span>
      {vol != null ? (
        <span className="inline-flex items-center gap-1">
          <BarChart3 size={12} className="text-cyan-400 shrink-0" />${vol} 24h
        </span>
      ) : null}
      {liq != null ? <span>Liq ${liq}</span> : null}
    </div>
  );
});

/** Tamper-evident radar row context (from `?ctx=`); hidden when URL is scrubbed as invalid. */
export const DeskRadarHintStrip = memo(function DeskRadarHintStrip({ hint }) {
  const { t } = useLocale();
  if (!hint || (!hint.src && hint.tr == null && hint.sw == null)) return null;
  const parts = [];
  if (hint.src) parts.push(String(hint.src));
  if (Number.isFinite(hint.tr)) parts.push(`TR ${hint.tr}`);
  if (Number.isFinite(hint.sw)) parts.push(`SW ${hint.sw}`);
  return (
    <div
      className="rounded-md border border-violet-500/35 bg-gradient-to-r from-violet-950/45 via-violet-950/20 to-transparent px-2.5 py-1.5 shrink-0"
      role="status"
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-200/90">{t("cockpit.desk.radarCtxTitle")}</p>
      <p className="font-mono text-[10px] text-violet-100/90 mt-0.5">{parts.join(" · ")}</p>
      <p className="text-[9px] text-violet-300/75 mt-1 leading-snug">{t("cockpit.desk.radarCtxHelp")}</p>
    </div>
  );
});

export function useFlaggedWalletSet(token) {
  return useMemo(() => {
    const set = new Set();
    for (const s of token?.walletIntel?.signals || []) {
      if (s?.wallet) set.add(s.wallet);
    }
    return set;
  }, [token?.walletIntel]);
}
