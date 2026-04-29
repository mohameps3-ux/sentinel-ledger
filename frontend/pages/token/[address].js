import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { useTokenData } from "../../hooks/useTokenData";
import { useProStatus } from "../../hooks/useProStatus";
import { useWebSocket } from "../../hooks/useWebSocket";
import { TokenSkeleton } from "../../components/token/TokenSkeleton";
import { ChartPanel } from "../../components/token/ChartPanel";
import { RecentTokensSidebar } from "../../components/token/RecentTokensSidebar";
import { WatchlistButton } from "../../components/token/WatchlistButton";
import { ExpandablePanel } from "../../components/token/ExpandablePanel";
import { WalletThreatBanner } from "../../components/token/WalletThreatBanner";
import { CandlestickChart, Radio, ShieldAlert, Users } from "lucide-react";
import { formatUsdWhole } from "../../lib/formatStable";
import { Ticker } from "../../components/layout/Ticker";
import { FinancialDisclaimer } from "../../components/layout/FinancialDisclaimer";
import { PageHead } from "../../components/seo/PageHead";
import { useLocale } from "../../contexts/LocaleContext";
import { recordRecentToken } from "../../lib/recentTokens";
import { ApexCard, IridescentScore, deriveApexState } from "../../components/apex";
import {
  buildDexscreenerSolanaTokenUrl,
  buildJupiterSwapUrl,
  buildPumpFunTokenUrl,
  buildSolscanTokenUrl,
  EXTERNAL_ANCHOR_REL
} from "../../lib/terminalLinks";

const SmartMoneyPanel = dynamic(
  () => import("../../components/token/SmartMoneyPanel").then((mod) => mod.SmartMoneyPanel),
  { ssr: false, loading: () => <div className="border border-white/[0.06] bg-sl-card p-4 text-sm text-sl-muted">Loading smart money…</div> }
);
const HoldersPanel = dynamic(
  () => import("../../components/token/HoldersPanel").then((mod) => mod.HoldersPanel),
  { ssr: false }
);
const DeployerPanel = dynamic(
  () => import("../../components/token/DeployerPanel").then((mod) => mod.DeployerPanel),
  { ssr: false }
);
const LiveFlowPanel = dynamic(
  () => import("../../components/token/LiveFlowPanel").then((mod) => mod.LiveFlowPanel),
  { ssr: false, loading: () => <div className="border border-white/[0.06] bg-sl-card p-4 text-sm text-sl-muted">Loading live flow…</div> }
);
const NotesPanel = dynamic(
  () => import("../../components/token/NotesPanel").then((mod) => mod.NotesPanel),
  { ssr: false }
);

function shortMint(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 12) return addr || "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/** SSR this route so `router.query` matches the URL (avoids static shell + wrong “no data” / hydration issues). */
export async function getServerSideProps() {
  return { props: {} };
}

function normalizeAddress(query) {
  const raw = query?.address;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return "";
}

function usdOrNA(value, naLabel) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return naLabel;
  return `$${formatUsdWhole(n)}`;
}

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function actionTone(action) {
  const a = String(action || "WATCH").toUpperCase();
  if (a === "ACCUMULATE" || a === "ENTER NOW") return "border-indigo-400/50 bg-indigo-500/15 text-indigo-100";
  if (a === "TOO_LATE" || a === "TOO LATE" || a === "STAY OUT") return "border-red-400/45 bg-red-500/12 text-red-100";
  return "border-blue-400/45 bg-blue-500/12 text-blue-100";
}

function rulePerfTone(perf) {
  if (!perf?.hasSample) return "border-sl-border bg-white/[0.04] text-sl-sub";
  const c = Number(perf.confidenceScore || 0);
  if (c > 0.7) return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (c >= 0.5) return "border-blue-500/35 bg-blue-500/10 text-blue-200";
  return "border-sl-border bg-white/[0.04] text-sl-sub";
}

function formatRulePerfLabel(perf) {
  if (!perf?.ruleId) return null;
  if (!perf.hasSample) return `${perf.ruleId} · New rule — building track record`;
  const confidence = Math.round(Number(perf.confidenceScore || 0) * 100);
  const avg = Math.round(Number(perf.avgReturn60m || 0) * 100);
  return `${perf.ruleId} · ${confidence}% · ${avg >= 0 ? "+" : ""}${avg}% avg${
    perf.regimeContext ? ` · ⚠ ${perf.regimeContext}` : ""
  }`;
}

function formatRegimeLine(perf) {
  const rp = perf?.regimePerformance;
  if (!rp || typeof rp !== "object") return null;
  const bull = rp.bull?.hasSample ? Math.round(Number(rp.bull.confidence || 0) * 100) : null;
  const crab = rp.crab?.hasSample ? Math.round(Number(rp.crab.confidence || 0) * 100) : null;
  const vol = rp.volatile?.hasSample ? Math.round(Number(rp.volatile.confidence || 0) * 100) : null;
  const parts = [];
  if (bull != null) parts.push(`${bull}% in bull markets`);
  if (crab != null) parts.push(`${crab}% in ranging markets`);
  if (vol != null) parts.push(`${vol}% in volatile markets`);
  return parts.length ? `${perf.ruleId} works ${parts.join(", ")}.` : null;
}

function formatLatestOutcomeLine(perf) {
  const latest = perf?.latestOutcome;
  if (!latest) return null;
  const out = latest.outcome60m != null ? Number(latest.outcome60m) * 100 : null;
  const dd = latest.drawdown != null ? Number(latest.drawdown) * 100 : null;
  if (!Number.isFinite(out) || !Number.isFinite(dd) || dd > -10) return null;
  return `Signal hit ${out >= 0 ? "+" : ""}${out.toFixed(1)}% but had ${dd.toFixed(1)}% drawdown first.`;
}

function tri(v) {
  if (v === true) return { label: "YES", cls: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200" };
  if (v === false) return { label: "NO", cls: "border-red-500/35 bg-red-500/10 text-red-200" };
  return { label: "UNK", cls: "border-sl-border bg-white/[0.04] text-sl-sub" };
}

function hasPumpRoute(market) {
  const pairs = Array.isArray(market?.dexPairs) ? market.dexPairs : [];
  const pairUrl = String(market?.pairUrl || "").toLowerCase();
  return pairUrl.includes("pump.fun") || pairs.some((p) => String(p?.dexId || "").toLowerCase().includes("pump"));
}

function dedupeDexPairs(pairs) {
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const key = String(p?.pairAddress || p?.url || `${p?.dexId || ""}:${p?.quoteSymbol || ""}`).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function MetricCell({ label, value }) {
  return (
    <div className="min-w-0 border border-white/[0.07] bg-white/[0.025] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sl-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-sl-text">{value}</p>
    </div>
  );
}

/**
 * Token meta column — placed beside the chart (desktop) or above it (mobile).
 * Not sticky: avoids a full-width bar covering the chart when scrolling.
 */
function TokenMetaAside({
  address,
  market,
  analysis,
  terminal,
  statusTone,
  statusLabel,
  soundEnabled,
  setSoundEnabled,
  isWatchlisted,
  proStatusReady,
  hasToken,
  hasProAccess
}) {
  const jupiterUrl = buildJupiterSwapUrl(address);
  const dexUrl = buildDexscreenerSolanaTokenUrl(address);
  const solscanUrl = buildSolscanTokenUrl(address);
  const pumpUrl = hasPumpRoute(market) ? buildPumpFunTokenUrl(address) : null;
  const score = Math.round(Number(terminal?.signalStrength ?? analysis?.confidence ?? 0));
  const apexState = deriveApexState(score);
  const priceChange = Number(market.priceChange24h);
  const priceUp = Number.isFinite(priceChange) && priceChange >= 0;

  return (
    <ApexCard
      as="aside"
      id="token-meta"
      state={apexState}
      className="apex-card--terminal-blue order-1 w-full max-w-full shrink-0 p-3 backdrop-blur-sm xl:order-2 xl:max-w-[20rem] xl:shrink-0"
    >
      <div className="space-y-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-black tracking-tight text-[#fafafa] sm:text-2xl">
            {market.name || market.symbol || "Token"}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">
              SOLANA
            </span>
            <span className="border border-blue-400/15 bg-blue-950/30 px-2 py-0.5 font-mono text-[10px] text-blue-100/85">
              {shortMint(address)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#737373]">${market.symbol || "TOKEN"}</p>
        </div>

        <div>
          <p className="font-mono text-2xl font-black leading-none text-[#fafafa] sm:text-3xl">{usdOrNA(market.price, "$0")}</p>
          <p className={`mt-0.5 font-mono text-sm font-semibold ${priceUp ? "text-emerald-300" : "text-red-300"}`}>
            {pct(market.priceChange24h)} · 24h
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="border border-blue-500/20 bg-blue-500/5 px-2 py-2 text-center sm:px-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#737373]">Grade</p>
            <p className="mt-0.5 text-lg font-black leading-none text-[#fafafa] sm:text-xl">{analysis.grade || "—"}</p>
          </div>
          <div className="flex items-center justify-center px-1 py-0.5 sm:px-2">
            <IridescentScore value={score} label="Sentinel" size="sm" align="center" />
          </div>
        </div>

        <a href={jupiterUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="btn-primary inline-flex w-full justify-center">
          TRADE NOW
        </a>

        <div className="flex flex-wrap items-stretch justify-start gap-1.5">
          <a href={dexUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="apex-btn-secondary">
            DEX
          </a>
          <a href={solscanUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="apex-btn-secondary">
            Solscan
          </a>
          {pumpUrl ? (
            <a href={pumpUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="apex-btn-secondary">
              Pump
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-blue-500/18 pt-2">
          <span className="inline-flex items-center gap-2 border border-blue-400/22 bg-blue-950/25 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-blue-100/80">
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone}`} />
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="apex-btn-secondary"
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? "Sound on" : "Sound off"}
          </button>
          <WatchlistButton tokenAddress={address} isWatchlisted={isWatchlisted} />
          {proStatusReady && hasToken && hasProAccess ? (
            <Link href="/alerts" className="apex-btn-secondary">
              Alerts
            </Link>
          ) : null}
        </div>
      </div>
    </ApexCard>
  );
}

function TokenAlertStack({ token, convergence, redSig, coordMeta, t }) {
  if (!token?.walletIntel && !convergence?.detected && !redSig) return null;
  return (
    <section className="space-y-3">
      <WalletThreatBanner walletIntel={token.walletIntel} />
      {convergence?.detected ? (
        <div className="glass-card border border-emerald-500/35 bg-emerald-500/10 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-emerald-200 font-semibold">{t("token.conv.title")}</p>
          <p className="text-sm text-sl-sub mt-1">
            {t("token.conv.body", {
              count: Math.max(3, Number(convergence?.wallets?.length || 0)),
              minutes: Number(convergence?.windowMinutes || 10)
            })}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {(convergence?.wallets || []).slice(0, 8).map((w) => (
              <span
                key={w}
                className="mono text-[11px] px-2 py-1 rounded border border-white/15 bg-white/5 text-emerald-200"
              >
                {w.slice(0, 4)}...{w.slice(-4)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {redSig ? (
        <div
          className={`glass-card border px-4 py-3 ${
            redSig === "RED_CONFIRM"
              ? "border-red-500/45 bg-red-500/10"
              : redSig === "RED_PREPARE"
                ? "border-blue-500/40 bg-blue-500/10"
                : "border-slate-500/40 bg-slate-500/5"
          }`}
        >
          <p className="text-xs uppercase tracking-wider font-semibold text-sl-sub">
            {t("token.red.walletCoord")} - {redSig.replace(/_/g, " ")}
          </p>
          {coordMeta && typeof coordMeta === "object" ? (
            <p className="text-[12px] text-sl-sub mt-2 leading-relaxed">
              {coordMeta.priorClusterAlerts != null
                ? t("token.red.priorIntro", {
                    a: String(coordMeta.priorClusterAlerts),
                    suffix:
                      coordMeta.uniqueMintsWithPriorClusterAlerts != null
                        ? t("token.red.priorSuffixMints", { m: coordMeta.uniqueMintsWithPriorClusterAlerts })
                        : ""
                  })
                : null}{" "}
              {coordMeta.meanCoordinationLeadSecPrior != null
                ? t("token.red.meanLeadPrior", { s: coordMeta.meanCoordinationLeadSecPrior })
                : null}
              {coordMeta.coordinationLeadSec != null ? t("token.red.windowLead", { s: coordMeta.coordinationLeadSec }) : null}
            </p>
          ) : null}
          {redSig === "RED_ABORT" ? <p className="text-[12px] text-slate-300 mt-1">{t("token.red.abortNote")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function KeyMetricsBar({ market, naLabel }) {
  return (
    <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <MetricCell label="Liquidity" value={usdOrNA(market.liquidity, naLabel)} />
      <MetricCell label="Volume 24h" value={usdOrNA(market.volume24h, naLabel)} />
      <MetricCell label="FDV" value={usdOrNA(market.fdv || market.fullyDilutedValuation || market.marketCap, naLabel)} />
      <MetricCell label="Market Cap" value={usdOrNA(market.marketCap, naLabel)} />
    </section>
  );
}

function SentinelIntelligence({ address, analysis, terminal, flaggedWallets, rulePerformance }) {
  const score = Number(terminal?.signalStrength ?? analysis?.confidence ?? 0);
  const risk = Math.max(0, Math.min(100, Math.round(100 - score)));
  const smartMoney = Math.max(0, Math.min(100, Math.round(Number(terminal?.smartMoneyScore ?? terminal?.walletScore ?? score))));
  const momentum = Math.max(0, Math.min(100, Math.round(Number(terminal?.momentumScore ?? score))));
  const action = String(terminal?.suggestedAction || (score >= 75 ? "ACCUMULATE" : score >= 45 ? "WATCH" : "TOO LATE")).replace(/_/g, " ");
  const why = [
    ...(Array.isArray(analysis?.pros) ? analysis.pros : []),
    terminal?.rationale
  ].filter(Boolean).slice(0, 3);
  const ruleLabel = formatRulePerfLabel(rulePerformance);
  const regimeLine = formatRegimeLine(rulePerformance);
  const latestOutcomeLine = formatLatestOutcomeLine(rulePerformance);

  return (
    <section id="intel" className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="glass-card sl-inset xl:col-span-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="sl-label">Sentinel Intelligence</p>
            <h2 className="mt-1 text-xl font-bold text-sl-text">Signal read</h2>
          </div>
          <span className={`border px-4 py-2 text-sm font-black uppercase tracking-[0.14em] ${actionTone(action)}`}>{action}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[["Risk", risk], ["Smart Money", smartMoney], ["Momentum", momentum]].map(([label, value]) => (
            <div key={label} className="border border-white/[0.07] bg-white/[0.025] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-sl-muted">{label}</p>
              <p className="mt-1 font-mono text-lg font-bold text-sl-text">{value}</p>
              <div className="mt-1 h-1 rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-sl-muted">Why</p>
          <ul className="mt-2 space-y-1.5 text-sm text-sl-sub">
            {(why.length ? why : ["Waiting for stronger indexed evidence."]).map((line) => (
              <li key={line} className="flex gap-2"><span className="text-violet-300">•</span><span>{line}</span></li>
            ))}
          </ul>
        </div>
        {ruleLabel ? (
          <div className={`border px-3 py-2 text-xs ${rulePerfTone(rulePerformance)}`}>
            <p className="font-mono font-semibold">{ruleLabel}</p>
            <p className="mt-1 text-[11px] opacity-80">
              {rulePerformance.hasSample
                ? `This signal type has worked ${Math.round(Number(rulePerformance.confidenceScore || 0) * 100)}% of the time (n=${rulePerformance.totalSignals}). 60m avg return: ${(Number(rulePerformance.avgReturn60m || 0) * 100).toFixed(1)}%.`
                : "Shadow validation is collecting outcomes before this rule can influence confidence."}
            </p>
            {regimeLine ? <p className="mt-1 text-[11px] opacity-80">{regimeLine}</p> : null}
            {latestOutcomeLine ? <p className="mt-1 text-[11px] text-blue-100/90">{latestOutcomeLine}</p> : null}
          </div>
        ) : null}
        <Link
          href="/graveyard"
          className="inline-flex w-fit items-center border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100 no-underline hover:bg-cyan-400/[0.12]"
        >
          View Sentinel&apos;s historical accuracy →
        </Link>
      </div>
      <div className="xl:col-span-7">
        <ExpandablePanel title="Smart wallets on this mint" icon={Radio} defaultOpen={true} badge="PRO intel">
          <SmartMoneyPanel tokenAddress={address} flaggedWallets={flaggedWallets} />
        </ExpandablePanel>
      </div>
    </section>
  );
}

function SecurityReport({ security }) {
  const mint = tri(security?.mintRenounced);
  const freeze = tri(security?.freezeAuthorityInactive);
  const lp = tri(security?.liquidityLocked === true ? true : security?.liquidityLocked === false ? false : null);
  return (
    <section className="glass-card sl-inset space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="sl-label">Security Report</p>
        <span className="text-[10px] text-sl-muted">Compact view</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[["Mint Renounced", mint], ["Freeze Off", freeze], ["LP Status", lp]].map(([label, v]) => (
          <div key={label} className="border border-white/[0.07] bg-white/[0.025] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-sl-muted">{label}</p>
            <span className={`mt-2 inline-flex border px-2 py-1 text-xs font-bold ${v.cls}`}>{v.label}</span>
          </div>
        ))}
      </div>
      <details className="border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-sl-sub">
        <summary className="cursor-pointer text-sl-sub">Full security details</summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-sl-muted">{JSON.stringify(security || {}, null, 2)}</pre>
      </details>
    </section>
  );
}

function DexVenuesPanel({ address, market }) {
  const dexPairs = dedupeDexPairs(market?.dexPairs);
  const dexUrl = buildDexscreenerSolanaTokenUrl(address);
  const jupiterUrl = buildJupiterSwapUrl(address);
  return (
    <div className="space-y-2">
      {dexPairs.length === 0 ? (
        <p className="text-sm text-sl-muted">No routed pools returned.</p>
      ) : (
        dexPairs.map((p) => (
          <div key={String(p?.pairAddress || p?.url || p?.dexId)} className="flex flex-wrap items-center justify-between gap-2 border border-white/[0.06] bg-sl-card px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium capitalize text-sl-text">{p.dexId || "DEX"}</div>
              <div className="truncate font-mono text-[10px] text-sl-muted">{p.pairAddress || p.url || "pool"}</div>
            </div>
            <div className="flex gap-1.5">
              <a href={dexUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="rounded-md border border-sl-border bg-white/[0.04] px-2 py-1 text-[11px] text-sl-sub">Chart</a>
              <a href={jupiterUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-100">Jupiter</a>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function TokenPage() {
  const router = useRouter();
  const { t } = useLocale();
  const address = normalizeAddress(router.query);
  const query = useTokenData(address);
  const proStatus = useProStatus();
  const { transactions, isConnected, connectionState, convergence: liveConvergence, coordination } = useWebSocket(
    address || undefined
  );
  const [hasToken, setHasToken] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const prevTopTxRef = useRef(null);

  useEffect(() => {
    try {
      setHasToken(!!localStorage.getItem("token"));
      setSoundEnabled(localStorage.getItem("sentinel-sound-enabled") === "1");
    } catch {
      setHasToken(false);
      setSoundEnabled(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sentinel-sound-enabled", soundEnabled ? "1" : "0");
    } catch {}
  }, [soundEnabled]);

  const token = useMemo(() => query.data?.data, [query.data]);
  const walletIntel = token?.walletIntel;
  const flaggedWallets = useMemo(() => {
    const set = new Set();
    for (const s of walletIntel?.signals || []) {
      if (s?.wallet) set.add(s.wallet);
    }
    return set;
  }, [walletIntel]);
  const recentTransactions = useMemo(() => transactions.slice(0, 30), [transactions]);

  // Record this token in the user's local last-24h analyzed log. Pure
  // localStorage, no backend; TTL handled inside lib/recentTokens.js.
  // Runs unconditionally so it complies with rules-of-hooks; the helper
  // itself bails if address/market are missing.
  useEffect(() => {
    const symbol = query.data?.data?.market?.symbol || "";
    const name = query.data?.data?.market?.name || "";
    if (!address || (!symbol && !name)) return;
    recordRecentToken({ mint: address, symbol, name });
  }, [address, query.data?.data?.market?.symbol, query.data?.data?.market?.name]);

  useEffect(() => {
    if (!soundEnabled) return;
    const topTx = recentTransactions[0];
    if (!topTx || !topTx.shouldNotify) return;
    const signature = topTx.signature || `${topTx.wallet}-${topTx.timestamp}`;
    if (prevTopTxRef.current === signature) return;
    prevTopTxRef.current = signature;
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.start(now);
    osc.stop(now + 0.1);
    const t = setTimeout(() => ctx.close(), 140);
    return () => clearTimeout(t);
  }, [recentTransactions, soundEnabled]);

  if (!router.isReady) return <TokenSkeleton />;

  if (!address || address.length < 32) {
    return (
      <>
        <PageHead title={t("token.pageTitleShort")} description={t("token.pageDescMint")} />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">{t("token.invalidTitle")}</h2>
          <p className="text-sl-sub text-sm">{t("token.invalidBody")}</p>
        </div>
      </div>
      </>
    );
  }

  if (query.isPending) return <TokenSkeleton />;

  if (query.isError) {
    return (
      <>
        <PageHead title={`${shortMint(address)} — Sentinel Ledger`} description={t("token.pageDescRetry")} />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold text-red-300 mb-2">{t("token.errorTitle")}</h2>
          <p className="text-sl-sub text-sm">{t("token.errorBody")}</p>
        </div>
      </div>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <PageHead title={`${shortMint(address)} — Sentinel Ledger`} description={t("token.pageDescMint")} />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">{t("token.noDataTitle")}</h2>
          <p className="text-sl-sub text-sm">{t("token.noDataBody")}</p>
        </div>
      </div>
      </>
    );
  }

  if (!token.market || !token.analysis) {
    return (
      <>
        <PageHead title={`${shortMint(address)} — Sentinel Ledger`} description={t("token.pageDescMint")} />
        <div className="max-w-xl mx-auto px-4 py-20">
          <div className="glass-card p-8 text-center space-y-4">
            <h2 className="text-xl font-semibold text-blue-200">{t("token.incompleteTitle")}</h2>
            <p className="text-sl-sub text-sm leading-relaxed">{t("token.incompleteBody")}</p>
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="px-4 py-2.5 border border-white/15 bg-white/[0.06] text-sm text-sl-sub hover:bg-white/10 disabled:opacity-50"
            >
              {query.isFetching ? t("token.retrying") : t("token.retry")}
            </button>
            <p className="text-[11px] text-sl-muted font-mono break-all">{address}</p>
          </div>
        </div>
      </>
    );
  }

  const { market, analysis, private: privateData } = token;
  const convergence = liveConvergence?.detected ? liveConvergence : token?.convergence;
  const redSig = coordination?.redSignal;
  const coordMeta = coordination?.meta;
  const isWatchlisted = privateData?.isWatchlist || false;
  const note = privateData?.notes || "";
  const hasProAccess = proStatus.data?.data?.hasProAccess === true;
  const proStatusReady = !hasToken || proStatus.isSuccess || proStatus.isError;
  const statusTone =
    connectionState === "connected"
      ? "bg-emerald-400"
      : connectionState === "reconnecting"
        ? "bg-blue-300"
        : "bg-red-400";
  const statusLabel =
    connectionState === "connected"
      ? t("token.status.connected")
      : connectionState === "reconnecting"
        ? t("token.status.reconnecting")
        : t("token.status.disconnected");

  return (
    <>
      <PageHead
        title={`${market.symbol} (${shortMint(address)}) — Sentinel Ledger`}
        description={t("token.pageDescLive", { symbol: market.symbol })}
      />
    <div className="sl-container py-6 pb-28 lg:pb-10">
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-5">
        <div className="hidden xl:block">
          <RecentTokensSidebar activeMint={address} />
        </div>

        <div className="space-y-6 min-w-0">
          {/* Mobile: title/info first, then chart. Desktop: chart left, title/info right (matches home desk layout). */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
            <section
              id="chart"
              className="order-2 min-w-0 w-full flex-1 scroll-mt-[calc(var(--sl-nav-actual,52px)+0.75rem)] xl:order-1"
            >
              <ChartPanel address={address} compact symbol={market.symbol || ""} />
            </section>
            <TokenMetaAside
              address={address}
              market={market}
              analysis={analysis}
              terminal={token?.terminal}
              statusTone={statusTone}
              statusLabel={statusLabel}
              soundEnabled={soundEnabled}
              setSoundEnabled={setSoundEnabled}
              isWatchlisted={isWatchlisted}
              proStatusReady={proStatusReady}
              hasToken={hasToken}
              hasProAccess={hasProAccess}
            />
          </div>

          <KeyMetricsBar market={market} naLabel={t("token.stat.na")} />

          <SentinelIntelligence
            address={address}
            analysis={analysis}
            terminal={token?.terminal}
            flaggedWallets={flaggedWallets}
            rulePerformance={token?.rulePerformance}
          />

          <TokenAlertStack token={token} convergence={convergence} redSig={redSig} coordMeta={coordMeta} t={t} />

          <SecurityReport security={token?.security} />

          <section id="flow" className="scroll-mt-24">
            <ExpandablePanel
              title={t("token.panel.liveTx")}
              icon={CandlestickChart}
              defaultOpen={true}
              badge={recentTransactions.length ? t("token.panel.badgeTx", { n: recentTransactions.length }) : null}
            >
              <LiveFlowPanel transactions={recentTransactions} tokenPriceUsd={market.price} />
            </ExpandablePanel>
          </section>

          <section className="space-y-4">
            <p className="sl-label">Details</p>
            <ExpandablePanel title={t("token.panel.holders")} icon={Users} defaultOpen={false}>
              <HoldersPanel holders={token?.holders} />
            </ExpandablePanel>
            <ExpandablePanel title={t("token.panel.deployer")} icon={ShieldAlert} defaultOpen={false}>
              <DeployerPanel deployer={token?.deployer} />
            </ExpandablePanel>
            <ExpandablePanel title="DEX venues" icon={Radio} defaultOpen={false} badge={`${dedupeDexPairs(market?.dexPairs).length} unique`}>
              <DexVenuesPanel address={address} market={market} />
            </ExpandablePanel>
            <ExpandablePanel title="Full security details" icon={ShieldAlert} defaultOpen={false}>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-sl-sub">
                {JSON.stringify(token?.security || {}, null, 2)}
              </pre>
            </ExpandablePanel>
          </section>
          {hasToken && <NotesPanel tokenAddress={address} initialNote={note} />}

          <div className="pt-4 pb-8 border-t border-gray-800/60 mt-8">
            <FinancialDisclaimer />
          </div>
        </div>
      </div>

      <div className="fixed safe-bottom-offset left-1/2 -translate-x-1/2 z-40 xl:hidden">
        <div className="glass-card px-2 py-1 flex items-center gap-1">
          <a href="#chart" className="px-3 h-8 text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            {t("token.nav.chart")}
          </a>
          <a href="#intel" className="px-3 h-8 text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            {t("token.nav.intel")}
          </a>
          <a href="#flow" className="px-3 h-8 text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            {t("token.nav.flow")}
          </a>
        </div>
      </div>
    </div>
    </>
  );
}
