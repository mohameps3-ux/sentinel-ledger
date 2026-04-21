import Link from "next/link";
import { useRouter } from "next/router";
import { useScoreSocket } from "../../hooks/useScoreSocket";
import { useTokenData } from "../../hooks/useTokenData";
import { isProbableSolanaMint } from "../../lib/solanaMint";
import { AccordionSection } from "./AccordionSection";
import {
  DeskAntiSignalBody,
  DeskContextStrip,
  DeskJupiterLinks,
  DeskProofOfEdgePanel,
  DeskQuickScan,
  DeskSmartMoneyLazy,
  deskAntiSummaryTone,
  useFlaggedWalletSet
} from "./IntelDeskPanels";

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function MiniBar({ label, value, gradient }) {
  const v = clampPct(value);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-[9px] uppercase tracking-wider text-gray-500 font-semibold shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-black/50 overflow-hidden ring-1 ring-white/5">
        <div className={`h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-7 text-right font-mono tabular-nums text-[10px] text-gray-300 shrink-0">{v}</span>
    </div>
  );
}

/**
 * Cockpit Zone C — Intel desk: live score (`useScoreSocket`) plus lazy accordions
 * backed by `useTokenData` (one REST load per pinned mint for structural intel).
 */
export function TokenDesk({ mint }) {
  const router = useRouter();
  const { score, isConnected } = useScoreSocket(mint || undefined);
  const tokenQuery = useTokenData(mint || "");
  const token = tokenQuery.data?.data;
  const flaggedWallets = useFlaggedWalletSet(token);
  const antiTone = deskAntiSummaryTone(token);

  if (!mint) {
    return (
      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <p className="text-sm font-semibold text-gray-300">Select a token</p>
        <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
          Click a card in the feed to pin it here via the URL, or paste a mint below.
        </p>
        <div className="w-full max-w-sm text-left">
          <AccordionSection title="Quick scan" summaryTone="neutral" defaultOpen>
            <DeskQuickScan currentMint={null} />
          </AccordionSection>
        </div>
      </div>
    );
  }

  const scores = score?.scores;
  const conf = score?.confidence;
  const confLabel = score?.confidenceLabel;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.08] pb-2 shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">Intel desk</p>
          <p className="font-mono text-xs text-cyan-200/90 truncate mt-1" title={mint}>
            {mint.slice(0, 6)}…{mint.slice(-4)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
              isConnected ? "border-emerald-500/35 text-emerald-200 bg-emerald-500/10" : "border-amber-500/30 text-amber-200 bg-amber-500/10"
            }`}
          >
            {isConnected ? "Live" : "Syncing"}
          </span>
          <button
            type="button"
            onClick={() => router.push("/", undefined, { shallow: true })}
            className="text-[10px] px-2 py-0.5 rounded-lg border border-white/12 text-gray-400 hover:text-gray-200 hover:border-white/20"
          >
            Clear
          </button>
        </div>
      </div>

      {tokenQuery.isPending ? (
        <p className="text-[11px] text-gray-500 shrink-0">Loading token context…</p>
      ) : tokenQuery.isError ? (
        <p className="text-[11px] text-amber-200/90 shrink-0">Token API unavailable — score socket still live.</p>
      ) : token ? (
        <div className="shrink-0">
          <DeskContextStrip token={token} />
        </div>
      ) : null}

      {!score?.scores ? (
        <p className="text-sm text-gray-500 shrink-0">Waiting for score…</p>
      ) : (
        <div className="space-y-2 min-w-0 shrink-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Confidence</span>
            <span className="text-lg font-black font-mono tabular-nums text-white">
              {conf != null && Number.isFinite(Number(conf)) ? `${Math.round(Number(conf))}%` : "—"}
            </span>
          </div>
          {confLabel ? <p className="text-[11px] text-gray-400 truncate">{String(confLabel)}</p> : null}
          <div className="space-y-2 rounded-lg border border-white/[0.08] bg-black/25 p-2.5">
            <MiniBar label="RSK" value={scores.risk} gradient="from-rose-500 via-red-500 to-orange-400" />
            <MiniBar label="SMT" value={scores.smart} gradient="from-emerald-400 via-lime-400 to-cyan-400" />
            <MiniBar label="MOM" value={scores.momentum} gradient="from-amber-300 via-amber-400 to-orange-400" />
          </div>
          {score.__verification ? (
            <p className="text-[10px] text-gray-500 font-mono">
              Integrity: <span className="text-gray-300">{String(score.__verification)}</span>
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1 min-h-0">
        <AccordionSection title="Jupiter · SOL sizes" summaryTone="neutral">
          <DeskJupiterLinks mint={mint} />
        </AccordionSection>

        <AccordionSection title="Proof of edge · 7d" summaryTone="neutral">
          <DeskProofOfEdgePanel mint={mint} />
        </AccordionSection>

        <AccordionSection title="Smart wallets" summaryTone="neutral">
          {isProbableSolanaMint(mint) ? (
            <DeskSmartMoneyLazy mint={mint} flaggedWallets={flaggedWallets} />
          ) : (
            <p className="text-xs text-gray-500">Invalid mint.</p>
          )}
        </AccordionSection>

        <AccordionSection title="⚠ Anti-signal" summaryTone={antiTone}>
          <DeskAntiSignalBody token={token} />
        </AccordionSection>

        <AccordionSection title="Quick scan" summaryTone="neutral">
          <DeskQuickScan currentMint={mint} />
        </AccordionSection>
      </div>

      <div className="mt-auto pt-2 border-t border-white/[0.06] shrink-0">
        <Link
          href={`/token/${mint}`}
          className="text-xs font-semibold text-emerald-300/90 hover:text-emerald-200 underline-offset-2 hover:underline"
        >
          Open full terminal →
        </Link>
      </div>
    </div>
  );
}
