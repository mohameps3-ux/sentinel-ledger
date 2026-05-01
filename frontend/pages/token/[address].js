import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { useTokenData } from "../../hooks/useTokenData";
import { useWebSocket } from "../../hooks/useWebSocket";
import { TokenSkeleton } from "../../components/token/TokenSkeleton";
import { ChartPanel } from "../../components/token/ChartPanel";
import { RecentTokensSidebar } from "../../components/token/RecentTokensSidebar";
import { WatchlistButton } from "../../components/token/WatchlistButton";
import { Ticker } from "../../components/layout/Ticker";
import { FinancialDisclaimer } from "../../components/layout/FinancialDisclaimer";
import { PageHead } from "../../components/seo/PageHead";
import { useLocale } from "../../contexts/LocaleContext";
import { recordRecentToken } from "../../lib/recentTokens";
import { useMarketStore } from "../../lib/store/marketStore";
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

function TerminalSecurityAccordionBody({ security }) {
  const mint = tri(security?.mintRenounced);
  const freeze = tri(security?.freezeAuthorityInactive);
  const lp = tri(security?.liquidityLocked === true ? true : security?.liquidityLocked === false ? false : null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ["Mint Renounced", mint],
          ["Freeze Off", freeze],
          ["LP Status", lp]
        ].map(([label, v]) => (
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
    </div>
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
          <div
            key={String(p?.pairAddress || p?.url || p?.dexId)}
            className="flex flex-wrap items-center justify-between gap-2 border border-white/[0.06] bg-sl-card px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium capitalize text-sl-text">{p.dexId || "DEX"}</div>
              <div className="truncate font-mono text-[10px] text-sl-muted">{p.pairAddress || p.url || "pool"}</div>
            </div>
            <div className="flex gap-1.5">
              <a href={dexUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="rounded-md border border-sl-border bg-white/[0.04] px-2 py-1 text-[11px] text-sl-sub">
                Chart
              </a>
              <a href={jupiterUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-100">
                Jupiter
              </a>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TerminalLeft({ address }) {
  return (
    <div className="tpt-left">
      <div className="tpt-l-header">
        <span className="tpt-l-title">LIVE TOKENS</span>
        <span className="tpt-l-new">LIVE ●</span>
      </div>

      <div className="tpt-l-search-wrap">
        <input className="tpt-l-search" placeholder="Filter tokens…" readOnly aria-readonly="true" />
      </div>

      <div className="tpt-l-filters">
        {["ALL", "HOT", "EARLY", "WATCH"].map((f) => (
          <button key={f} type="button" className="tpt-l-filter">
            {f}
          </button>
        ))}
      </div>

      <div className="tpt-l-cols">
        <span>TOKEN</span>
        <span>SCORE</span>
        <span>24H</span>
        <span>AGE</span>
      </div>

      <div className="tpt-l-list">
        <RecentTokensSidebar terminalMode activeAddress={address} />
      </div>

      <div className="tpt-l-footer">
        <Link href="/scanner" className="tpt-view-all">
          VIEW ALL TOKENS
        </Link>
        <span className="tpt-live-dot">● UPDATES EVERY 2.5s</span>
      </div>
    </div>
  );
}

function TerminalCenter({
  address,
  market,
  tokenData,
  score,
  whyBullets,
  entryWindow,
  regimeAction,
  jupiterUrl,
  dexUrl,
  solscanUrl,
  pumpUrl,
  isWatchlisted
}) {
  const liveEntry = useMarketStore((s) => (address ? s.scores.get(address) : undefined));
  const liveNarrative = useMarketStore((s) => (address ? s.narratives.get(address) : undefined));
  const isFresh = liveEntry && Date.now() - (liveEntry._ts ?? 0) < 120_000;
  const liveNum = isFresh
    ? Number.isFinite(Number(liveEntry.confidence))
      ? Number(liveEntry.confidence)
      : Number.isFinite(Number(liveEntry.score))
        ? Number(liveEntry.score)
        : null
    : null;
  const displayScore =
    liveNum != null ? Math.round(liveNum) : Math.round(Number(score?.sentinelScore ?? score?.confidence ?? 0) || 0);

  const narrative =
    liveNarrative?.message ?? whyBullets?.[0] ?? "Analyzing market conditions…";

  const ra = String(regimeAction || "WATCH").toUpperCase();
  const regimeClass =
    ra === "BUY" || ra === "ACCUMULATE" || ra === "ENTER NOW" ? "tpt-regime-buy" : ra === "SCALP" ? "tpt-regime-scalp" : ra === "WATCH" ? "tpt-regime-watch" : "tpt-regime-avoid";

  const sym = market?.symbol ?? tokenData?.symbol ?? address.slice(0, 6);
  const name = market?.name ?? tokenData?.name ?? "";
  const price = Number(market?.price ?? tokenData?.price ?? 0);
  const img = market?.imageUrl ?? tokenData?.imageUrl ?? market?.image ?? null;
  const chg = Number(market?.priceChange24h ?? tokenData?.priceChange24h ?? 0);
  const liq = Number(market?.liquidityUsd ?? market?.liquidity ?? tokenData?.liquidityUsd ?? 0);
  const vol = Number(market?.volume24h ?? tokenData?.volume24h ?? 0);
  const mcap = Number(market?.marketCap ?? tokenData?.marketCap ?? 0);
  const fdv = Number(market?.fdv ?? tokenData?.fdv ?? 0);
  const top10 = Number(score?.holderConcentration ?? score?.top10Pct ?? tokenData?.holders?.top10Percentage ?? 0);
  const smartPct = Math.round(
    Number(score?.smartMoney ?? score?.smartMoneyScore ?? tokenData?.terminal?.smartMoneyScore ?? displayScore) || 0
  );
  const smartPctClamped = Math.min(95, Math.max(5, smartPct));

  function fmtUsd(n) {
    if (!n || n <= 0) return "—";
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }

  return (
    <div className="tpt-center">
      <div className="tpt-c-header">
        <div className="tpt-c-breadcrumb">TOKEN · TERMINAL</div>
        <div className="tpt-c-token-img">
          {img ? (
            <img src={img} alt={sym} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <span>{sym.slice(0, 2).toUpperCase()}</span>
          )}
        </div>

        <div className="tpt-c-name">
          <div className="tpt-c-sym">${sym}</div>
          <div className="tpt-c-fullname">{name}</div>
          <div className="tpt-c-badges">
            <span className="tpt-c-chain">SOLANA</span>
            <button
              type="button"
              className="tpt-c-mint"
              onClick={() => navigator.clipboard?.writeText(address)}
            >
              {address.slice(0, 4)}…{address.slice(-4)} ⧉
            </button>
          </div>
        </div>

        <div className="tpt-c-price-block">
          <div className="tpt-c-price">{price > 0 ? `$${price < 0.001 ? price.toFixed(6) : price.toFixed(4)}` : "—"}</div>
          <div className={chg >= 0 ? "tpt-c-chg-pos" : "tpt-c-chg-neg"}>
            {chg >= 0 ? "+" : ""}
            {chg.toFixed(2)}% 24H
          </div>
        </div>

        <div className="tpt-c-grade">
          <div className="tpt-c-grade-label">SENTINEL GRADE</div>
          <div className="tpt-c-grade-val">{score?.grade ?? "A+"}</div>
          <div className="tpt-c-grade-sub">{displayScore} / 100</div>
        </div>

        <div className={`tpt-c-regime ${regimeClass}`}>
          <div className="tpt-c-regime-label">TACTICAL REGIME</div>
          <div className="tpt-c-regime-action">{regimeAction}</div>
          <div className="tpt-c-regime-entry">
            {entryWindow === "EARLY" ? "EARLY ENTRY" : entryWindow === "MID" ? "MID ENTRY" : "LATE — CAUTION"}
          </div>
          <div className="tpt-c-regime-exec">
            Execution: {score?.execution ?? score?.executionScore ?? tokenData?.terminal?.executionScore ?? 82}
          </div>
        </div>

        {[
          { label: "LIQUIDITY", val: fmtUsd(liq) },
          { label: "VOLUME 24H", val: fmtUsd(vol) },
          { label: "M. CAP", val: fmtUsd(mcap) },
          { label: "FDV", val: fmtUsd(fdv) }
        ].map((m) => (
          <div key={m.label} className="tpt-c-metric">
            <div className="tpt-c-metric-label">{m.label}</div>
            <div className="tpt-c-metric-val">{m.val}</div>
          </div>
        ))}
      </div>

      <div id="chart" className="tpt-c-chart scroll-mt-[calc(var(--sl-nav-actual,52px)+0.75rem)]">
        <ChartPanel address={address} compact symbol={sym} />
        <div className="tpt-c-chart-cover">{`SENTINEL · LIVE CHART · $${sym}`}</div>
      </div>

      <div className="tpt-c-analysis">
        <div className="tpt-c-ap">
          <div className="tpt-c-ap-title">
            SMART MONEY FLOW
            <span className="tpt-c-live">● LIVE</span>
          </div>
          <div className="tpt-c-ap-green">BUY PRESSURE {smartPctClamped}%</div>
          <div className="tpt-c-ap-red">SELL {100 - smartPctClamped}%</div>
          <div className="tpt-c-pbar">
            <div className="tpt-c-pbar-buy" style={{ width: `${smartPctClamped}%` }} />
            <div className="tpt-c-pbar-sell" style={{ width: `${100 - smartPctClamped}%` }} />
          </div>
        </div>

        <div className="tpt-c-ap">
          <div className="tpt-c-ap-title">
            SMART MONEY INFLOW
            <span className="tpt-c-sub">5M</span>
          </div>
          <div className="tpt-c-ap-green">{score?.smartInflow ? `+$${score.smartInflow}` : "+$—"}</div>
          <div className="tpt-c-ap-muted">NET INFLOW</div>
        </div>

        <div className="tpt-c-ap">
          <div className="tpt-c-ap-title">
            WHALE ACTIVITY
            <span className="tpt-c-sub">24H</span>
          </div>
          <div className="tpt-c-ap-white">{score?.whaleCount ?? score?.smartWallets ?? tokenData?.terminal?.smartWallets ?? "—"}</div>
          <div className="tpt-c-ap-blue">{fmtUsd(vol)}</div>
          <div className="tpt-c-ap-muted">WHALE TXS · VOLUME</div>
        </div>

        <div className="tpt-c-ap" style={{ borderRight: "none" }}>
          <div className="tpt-c-ap-title">HOLDER CONCENTRATION</div>
          <div className="tpt-c-ap-white">{top10 > 0 ? `${top10.toFixed(1)}%` : "—"}</div>
          <div className={top10 > 0 && top10 < 30 ? "tpt-c-ap-green" : "tpt-c-ap-red"}>{top10 > 0 ? (top10 < 30 ? "LOW RISK" : "HIGH RISK") : "—"}</div>
          <div className="tpt-c-holder-bar">
            <div className="tpt-c-holder-fill" style={{ width: `${Math.min(top10 * 2, 100)}%` }} />
          </div>
          <div className="tpt-c-ap-muted">TOP 10</div>
        </div>
      </div>

      <div id="intel" className="tpt-c-narrative scroll-mt-[calc(var(--sl-nav-actual,52px)+0.75rem)]">
        <div className="tpt-c-np">
          <div className="tpt-c-np-title">
            SENTINEL NARRATIVE
            <span className="tpt-c-ai-badge">AI GENERATED</span>
          </div>
          <div className="tpt-c-narr-text">{narrative}</div>
          <div className="tpt-c-conf-row">
            <span className="tpt-c-conf-label">CONFIDENCE:</span>
            <span className="tpt-c-conf-val">HIGH</span>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`tpt-c-cdot ${i <= 3 ? "tpt-c-cdot-on" : ""}`} />
            ))}
            <span className="tpt-c-conf-age">UPDATED 12s AGO</span>
          </div>
        </div>

        <div className="tpt-c-np" style={{ borderRight: "1px solid rgba(255,255,255,.07)" }}>
          <div className="tpt-c-np-title">KEY REASONS</div>
          {(whyBullets.length > 0 ? whyBullets : ["Analyzing smart wallet behavior…", "Processing market signals…"])
            .slice(0, 3)
            .map((b, i) => (
              <div key={i} className="tpt-c-reason">
                <div className="tpt-c-reason-dot" />
                <span>{b}</span>
              </div>
            ))}
          <a href="#intel" className="tpt-c-view-btn">
            VIEW FULL ANALYSIS →
          </a>
        </div>

        <div className="tpt-c-np" style={{ borderRight: "none" }}>
          <div className="tpt-c-np-title">ENTRY WINDOW</div>
          <div className="tpt-c-entry-big">{entryWindow}</div>
          <div className="tpt-c-entry-scale">
            <div className={`tpt-c-es-early ${entryWindow === "EARLY" ? "tpt-c-es-on" : ""}`}>EARLY</div>
            <div className={`tpt-c-es-mid ${entryWindow === "MID" ? "tpt-c-es-mid-on" : ""}`}>MID</div>
            <div className={`tpt-c-es-late ${entryWindow === "LATE" ? "tpt-c-es-late-on" : ""}`}>LATE</div>
          </div>
          <div className="tpt-c-entry-meta">
            Movement age: {score?.poolAgeMinutes ?? market?.poolAgeMinutes ?? "—"}m
          </div>
        </div>
      </div>

      <div className="tpt-c-trade-bar">
        <a href={jupiterUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="tpt-c-trade-now">
          <span>TRADE NOW →</span>
          <span className="tpt-c-trade-sub">JUPITER</span>
        </a>
        <a href={dexUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="tpt-c-trade-sec">
          DEX
        </a>
        <a href={solscanUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="tpt-c-trade-sec">
          SOLSCAN
        </a>
        {pumpUrl ? (
          <a href={pumpUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className="tpt-c-trade-sec">
            PUMP.FUN
          </a>
        ) : null}
        <div className="tpt-c-watchlist">
          <WatchlistButton tokenAddress={address} isWatchlisted={isWatchlisted} />
        </div>
      </div>
    </div>
  );
}

function TerminalRight({ address, tokenData, recentTransactions, tokenPriceUsd, flaggedWallets }) {
  const market = tokenData?.market ?? {};
  const analysis = tokenData?.analysis ?? {};
  const score = { ...analysis, ...tokenData?.terminal, holderConcentration: tokenData?.holders?.top10Percentage };
  const dexUnique = dedupeDexPairs(market?.dexPairs).length;
  const deployerAddr = tokenData?.deployer?.address;

  return (
    <div className="tpt-right">
      <div className="tpt-r-tx-hdr">
        <span className="tpt-r-tx-title">LIVE TRANSACTIONS</span>
        <span className="tpt-r-tx-filter">FILTER: &gt;0.1 SOL</span>
        <span className="tpt-r-tx-rate">● LIVE</span>
      </div>

      <div className="tpt-r-tx-cols">
        <span>TIME</span>
        <span>TYPE</span>
        <span>WALLET/ENTITY</span>
        <span>BEHAVIOR</span>
        <span>AMOUNT</span>
        <span>PRICE</span>
      </div>

      <div id="flow" className="tpt-r-tx-list scroll-mt-24">
        <LiveFlowPanel transactions={recentTransactions} tokenPriceUsd={tokenPriceUsd} />
      </div>

      <div className="tpt-r-view-all">VIEW ALL TRANSACTIONS →</div>

      <div className="tpt-r-accordions">
        <details className="tpt-r-accord">
          <summary className="tpt-r-accord-sum">
            <div className="tpt-r-accord-left">
              <div className="tpt-r-accord-icon">🔒</div>
              <div>
                <div className="tpt-r-accord-title">SECURITY REPORT</div>
                <div className="tpt-r-accord-sub">Mint renounced · Freeze · LP</div>
              </div>
            </div>
            <div className="tpt-r-accord-right">
              <span className="tpt-r-badge-safe">SAFE</span>
              <span className="tpt-r-chevron">›</span>
            </div>
          </summary>
          <div className="tpt-r-accord-body">
            <TerminalSecurityAccordionBody security={tokenData?.security} />
          </div>
        </details>

        <details className="tpt-r-accord">
          <summary className="tpt-r-accord-sum">
            <div className="tpt-r-accord-left">
              <div className="tpt-r-accord-icon">👥</div>
              <div>
                <div className="tpt-r-accord-title">HOLDER DISTRIBUTION</div>
                <div className="tpt-r-accord-sub">{tokenData?.holders?.totalHolders ?? "—"} holders</div>
              </div>
            </div>
            <div className="tpt-r-accord-right">
              <span className="tpt-r-chevron">›</span>
            </div>
          </summary>
          <div className="tpt-r-accord-body">
            <HoldersPanel holders={tokenData?.holders} />
          </div>
        </details>

        <details className="tpt-r-accord">
          <summary className="tpt-r-accord-sum">
            <div className="tpt-r-accord-left">
              <div className="tpt-r-accord-icon">🔍</div>
              <div>
                <div className="tpt-r-accord-title">DEPLOYER INTEL</div>
                <div className="tpt-r-accord-sub">
                  {deployerAddr ? `${deployerAddr.slice(0, 4)}…${deployerAddr.slice(-4)}` : shortMint(address)}
                </div>
              </div>
            </div>
            <div className="tpt-r-accord-right">
              <span className="tpt-r-chevron">›</span>
            </div>
          </summary>
          <div className="tpt-r-accord-body">
            <DeployerPanel deployer={tokenData?.deployer} />
          </div>
        </details>

        <details className="tpt-r-accord">
          <summary className="tpt-r-accord-sum">
            <div className="tpt-r-accord-left">
              <div className="tpt-r-accord-icon">◎</div>
              <div>
                <div className="tpt-r-accord-title">DEX VENUES</div>
                <div className="tpt-r-accord-sub">Raydium · Orca · Meteora</div>
              </div>
            </div>
            <div className="tpt-r-accord-right">
              <span className="tpt-r-badge-unique">{dexUnique} UNIQUE 🔒</span>
              <span className="tpt-r-chevron">›</span>
            </div>
          </summary>
          <div className="tpt-r-accord-body">
            <DexVenuesPanel address={address} market={market} />
          </div>
        </details>

        <details className="tpt-r-accord">
          <summary className="tpt-r-accord-sum">
            <div className="tpt-r-accord-left">
              <div className="tpt-r-accord-icon">◈</div>
              <div>
                <div className="tpt-r-accord-title">SMART WALLETS ON THIS MINT</div>
                <div className="tpt-r-accord-sub">PRO intel</div>
              </div>
            </div>
            <div className="tpt-r-accord-right">
              <span className="tpt-r-badge-pro">PRO 🔒</span>
              <span className="tpt-r-chevron">›</span>
            </div>
          </summary>
          <div className="tpt-r-accord-body">
            <SmartMoneyPanel tokenAddress={address} flaggedWallets={flaggedWallets} />
          </div>
        </details>
      </div>

      <div className="tpt-r-footer">
        <span>DATA SOURCE: SENTINEL ORACLE</span>
        <span>LAST SYNC: 2.3s AGO ●</span>
      </div>
    </div>
  );
}

export default function TokenPage() {
  const router = useRouter();
  const { t } = useLocale();
  const address = normalizeAddress(router.query);
  const query = useTokenData(address);
  const { transactions } = useWebSocket(address || undefined);
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
  const tokenData = token;
  const marketDerived = tokenData?.market ?? tokenData ?? {};
  const score = tokenData?.score ?? tokenData?.sentinel ?? analysis ?? {};
  const whyBullets =
    tokenData?.whyNowBulletLines ??
    score?.whyNow ??
    score?.bullets ??
    (Array.isArray(analysis?.pros) ? analysis.pros : []);
  const regimeActionRaw =
    score?.regimeAction ??
    score?.tripleRisk?.action ??
    score?.tacticalRegime?.action ??
    score?.action ??
    token?.terminal?.suggestedAction ??
    "WATCH";
  const regimeAction = String(regimeActionRaw).toUpperCase().replace(/_/g, " ");
  const entryWindow =
    regimeAction === "BUY" || regimeAction === "ACCUMULATE" || regimeAction === "ENTER NOW"
      ? "EARLY"
      : regimeAction === "SCALP"
        ? "MID"
        : regimeAction === "WATCH"
          ? "MID"
          : "LATE";
  const isWatchlisted = privateData?.isWatchlist || false;
  const note = privateData?.notes || "";

  const jupiterUrl = buildJupiterSwapUrl(address);
  const dexUrl = buildDexscreenerSolanaTokenUrl(address);
  const solscanUrl = buildSolscanTokenUrl(address);
  const pumpUrl = hasPumpRoute(market) ? buildPumpFunTokenUrl(address) : null;

  const scoreForCenter = {
    ...analysis,
    ...token?.terminal,
    sentinelScore: Math.round(Number(token?.terminal?.signalStrength ?? analysis?.confidence ?? 0)),
    grade: analysis?.grade
  };

  return (
    <>
      <PageHead
        title={`${market.symbol} (${shortMint(address)}) — Sentinel Ledger`}
        description={t("token.pageDescLive", { symbol: market.symbol })}
      />
      <div className="tpt-root">
        <TerminalLeft address={address} />
        <TerminalCenter
          address={address}
          market={marketDerived}
          tokenData={tokenData}
          score={scoreForCenter}
          whyBullets={Array.isArray(whyBullets) ? whyBullets : []}
          entryWindow={entryWindow}
          regimeAction={regimeAction}
          jupiterUrl={jupiterUrl}
          dexUrl={dexUrl}
          solscanUrl={solscanUrl}
          pumpUrl={pumpUrl}
          isWatchlisted={isWatchlisted}
        />
        <TerminalRight
          address={address}
          tokenData={tokenData}
          recentTransactions={recentTransactions}
          tokenPriceUsd={market.price}
          flaggedWallets={flaggedWallets}
        />
      </div>

      <div className="sl-container py-4 pb-28 lg:pb-10 space-y-4">
        {hasToken ? <NotesPanel tokenAddress={address} initialNote={note} /> : null}
        <Ticker />
        <FinancialDisclaimer />
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
    </>
  );
}
