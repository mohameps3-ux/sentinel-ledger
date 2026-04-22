import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useTrendingTokens } from "../hooks/useTrendingTokens";
import { useSmartWalletsLeaderboard } from "../hooks/useSmartWalletsLeaderboard";
import { useSmartMoneyActivity } from "../hooks/useSmartMoneyActivity";
import { useWalletLabels } from "../hooks/useWalletLabels";
import { formatUsdWhole, formatDateTime } from "../lib/formatStable";
import { PageHead } from "../components/seo/PageHead";
import { Loader2, Radio, SlidersHorizontal } from "lucide-react";
import { WalletNarrativeCard } from "../components/WalletNarrativeCard";

function walletDecision(winRate) {
  const wr = Number(winRate || 0);
  if (wr >= 88) return { label: "FOLLOW", tone: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" };
  if (wr >= 74) return { label: "MONITOR", tone: "text-amber-300 border-amber-500/30 bg-amber-500/10" };
  return { label: "IGNORE", tone: "text-red-300 border-red-500/30 bg-red-500/10" };
}

const MIN_HORIZON_SAMPLE = 5;

function hasLowHorizonSample(profile) {
  if (!profile) return false;
  return (
    Number(profile.resolvedSignals5m || 0) < MIN_HORIZON_SAMPLE ||
    Number(profile.resolvedSignals30m || 0) < MIN_HORIZON_SAMPLE ||
    Number(profile.resolvedSignals2h || 0) < MIN_HORIZON_SAMPLE
  );
}

export default function SmartMoneyPage() {
  const trending = useTrendingTokens();
  const [chain, setChain] = useState("solana");
  const [minWinRate, setMinWinRate] = useState(0);
  const [minTrades, setMinTrades] = useState(0);
  const [expandedWallet, setExpandedWallet] = useState("");
  const [narrativeLang, setNarrativeLang] = useState("es");

  const { data, isLoading, isError, error, refetch } = useSmartWalletsLeaderboard({
    chain,
    minWinRate,
    minTrades
  });
  const activity = useSmartMoneyActivity(48);

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const meta = data?.meta || {};
  const actRows = Array.isArray(activity.data?.rows) ? activity.data.rows : [];

  const addresses = useMemo(() => rows.map((r) => r.wallet).filter(Boolean), [rows]);
  const { labelFor, titleFor } = useWalletLabels(addresses);

  const ranked = useMemo(() => {
    return rows.map((w, i) => ({
      ...w,
      rank: i + 1,
      decision: walletDecision(w.winRate)
    }));
  }, [rows]);

  return (
    <>
      <PageHead
        title="Smart Money Wallets — Sentinel Ledger"
        description="Top Solana smart wallets by win rate, 30d PnL, ROI vs average ticket size, and recent signal flow."
      />
      <div className="sl-container py-10 space-y-6 pb-24">
        <section className="sl-home-hero sl-inset sm:p-7 ring-1 ring-white/[0.06]">
          <p className="sl-label text-emerald-400/90">Smart Money</p>
          <h1 className="sl-h1 text-white mt-2 tracking-tight">Top 20 smart wallets</h1>
          <p className="sl-body sl-muted mt-2">
            Ranked by win rate with 30d PnL, estimated return versus average position size, and best resolved signal
            move when <span className="mono text-gray-400">result_pct</span> is populated. Source:{" "}
            <span className="font-mono text-gray-400">{meta.source || "—"}</span>
            {meta.count != null ? ` · ${meta.count} rows` : ""}.
          </p>
          <p className="text-xs text-gray-500 mt-3">
            Trending feed: {trending.isError ? "degraded" : "connected"} ·{" "}
            <button type="button" onClick={() => refetch()} className="text-cyan-400 hover:underline">
              Refresh leaderboard
            </button>
          </p>
        </section>

        <section className="glass-card sl-inset space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
            <SlidersHorizontal size={16} className="text-gray-500" />
            <span className="sl-label text-gray-400">Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">Chain</span>
              <select
                className="sl-input w-full h-10 px-3"
                value={chain}
                onChange={(e) => setChain(e.target.value)}
              >
                <option value="solana">Solana</option>
                <option value="all">All (same dataset)</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">Min win rate %</span>
              <input
                type="number"
                min={0}
                max={100}
                className="sl-input w-full h-10 px-3 mono"
                value={minWinRate || ""}
                placeholder="0"
                onChange={(e) => setMinWinRate(Number(e.target.value || 0))}
              />
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">Min total trades</span>
              <input
                type="number"
                min={0}
                className="sl-input w-full h-10 px-3 mono"
                value={minTrades || ""}
                placeholder="0"
                onChange={(e) => setMinTrades(Number(e.target.value || 0))}
              />
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span className="uppercase tracking-wide">Narrative lang</span>
              <select
                className="sl-input w-full h-10 px-3"
                value={narrativeLang}
                onChange={(e) => setNarrativeLang(e.target.value)}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <p className="text-[11px] text-gray-600">
            ROI column is <span className="text-gray-400">30d PnL ÷ avg position size</span> — a coarse multiple, not
            leverage-adjusted APR.
          </p>
        </section>

        {isLoading ? (
          <div className="glass-card sl-inset flex items-center justify-center gap-3 py-16 text-gray-400">
            <Loader2 className="animate-spin" size={22} />
            Loading wallets…
          </div>
        ) : null}

        {isError ? (
          <div className="glass-card sl-inset border border-red-500/30 text-red-200 text-sm py-6 px-4">
            {error?.message || "Could not load leaderboard."}
          </div>
        ) : null}

        {!isLoading && !isError && ranked.length === 0 ? (
          <section className="glass-card sl-inset text-center py-12 space-y-3">
            <p className="text-gray-300">No rows match filters (or smart_wallets is empty).</p>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              Run <code className="text-gray-400">npm run seed:terminal-home</code> in backend, or widen filters.
            </p>
            <Link href="/pricing" className="btn-pro inline-flex no-underline mt-2">
              Upgrade for token-level smart money
            </Link>
          </section>
        ) : null}

        {!isLoading && !isError && ranked.length > 0 ? (
          <>
            <section className="glass-card sl-inset overflow-x-auto hidden xl:block">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/10">
                    <th className="py-2 pr-2 w-10">#</th>
                    <th className="py-2 pr-3">Wallet</th>
                    <th className="py-2 pr-3">Win rate</th>
                    <th className="py-2 pr-3">WR real 5m/30m/2h</th>
                    <th className="py-2 pr-3">30d ROI†</th>
                    <th className="py-2 pr-3">30d PnL</th>
                    <th className="py-2 pr-3">Trades</th>
                    <th className="py-2 pr-3">Best trade</th>
                    <th className="py-2 pr-3">Last seen</th>
                    <th className="py-2">Call</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((w) => (
                    <Fragment key={w.wallet}>
                      <tr className="border-b border-white/5 hover:bg-white/[0.02] group">
                        <td className="py-3 pr-2 text-gray-500 mono text-xs">{w.rank}</td>
                        <td className="py-3 pr-3">
                          <div className="min-w-0">
                            <div className="text-gray-100 font-medium truncate" title={titleFor(w.wallet)}>
                              <Link className="hover:text-cyan-300" href={`/wallet/${w.wallet}?lang=${narrativeLang}`}>
                                {labelFor(w.wallet)}
                              </Link>
                            </div>
                            <div className="font-mono text-[11px] text-gray-500 truncate">{w.wallet}</div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-emerald-300 tabular-nums">{w.winRate.toFixed(1)}%</td>
                        <td className="py-3 pr-3 text-[11px] text-gray-300 leading-tight">
                          {w.profile ? (
                            <div className="space-y-0.5">
                              <div className="font-mono">
                                5m {Number(w.profile.winRateReal5m || 0).toFixed(1)}% · 30m{" "}
                                {Number(w.profile.winRateReal30m || 0).toFixed(1)}% · 2h{" "}
                                {Number(w.profile.winRateReal2h || 0).toFixed(1)}%
                              </div>
                              <div className="text-gray-500">
                                n {w.profile.resolvedSignals5m || 0}/{w.profile.resolvedSignals30m || 0}/
                                {w.profile.resolvedSignals2h || 0}
                              </div>
                              {hasLowHorizonSample(w.profile) ? (
                                <div className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-200">
                                  Low sample
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-gray-600">pending</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-cyan-200/90 tabular-nums">{Number(w.roi30dVsAvgSize || 0).toFixed(2)}×</td>
                        <td className="py-3 pr-3 text-emerald-200/90 tabular-nums">+${formatUsdWhole(w.pnl30d)}</td>
                        <td className="py-3 pr-3 tabular-nums text-gray-200">{w.totalTrades ?? "—"}</td>
                        <td className="py-3 pr-3 text-xs text-gray-300">
                          {w.bestTradePct != null ? (
                            <span className="text-emerald-300 font-mono">+{w.bestTradePct.toFixed(1)}%</span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                          {w.bestTradeMint ? (
                            <div className="text-[10px] text-gray-600 mono truncate max-w-[200px] mt-0.5">
                              <Link className="hover:text-cyan-300" href={`/token/${w.bestTradeMint}`}>
                                mint…{w.bestTradeMint.slice(-4)}
                              </Link>
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3 text-gray-400 text-xs whitespace-nowrap">
                          {w.lastSeen ? formatDateTime(w.lastSeen) : "—"}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-1 rounded border ${w.decision.tone}`}>{w.decision.label}</span>
                            <Link
                              href={`/wallet/${w.wallet}?lang=${narrativeLang}#behavior-memory`}
                              className="text-[11px] px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                            >
                              Behavior
                            </Link>
                            <button
                              type="button"
                              onClick={() => setExpandedWallet((v) => (v === w.wallet ? "" : w.wallet))}
                              className="text-[11px] px-2 py-1 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                            >
                              Why
                            </button>
                          </div>
                          {w.profile ? (
                            <p className="text-[10px] text-gray-500 mt-1 max-w-[260px]">
                              pre-pump ${formatUsdWhole(w.profile.avgSizePrePumpUsd || 0)} · latency{" "}
                              {w.profile.avgLatencyPostDeployMin != null
                                ? `${Number(w.profile.avgLatencyPostDeployMin).toFixed(1)}m`
                                : "—"}{" "}
                              · solo/grp {Math.round(Number(w.profile.soloBuyRatio || 0) * 100)}%/
                              {Math.round(Number(w.profile.groupBuyRatio || 0) * 100)}% · anti/brk{" "}
                              {Math.round(Number(w.profile.anticipatoryBuyRatio || 0) * 100)}%/
                              {Math.round(Number(w.profile.breakoutBuyRatio || 0) * 100)}%
                            </p>
                          ) : null}
                        </td>
                      </tr>
                      {expandedWallet === w.wallet ? (
                        <tr className="border-b border-white/5 bg-white/[0.015]">
                          <td colSpan={10} className="px-3 py-3">
                            <WalletNarrativeCard walletAddress={w.wallet} lang={narrativeLang} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="grid grid-cols-1 gap-3 xl:hidden">
              {ranked.map((w) => (
                <article
                  key={w.wallet}
                  className="glass-card p-4 rounded-2xl border border-white/10 space-y-2 hover:border-emerald-500/25 transition"
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate" title={titleFor(w.wallet)}>
                        #{w.rank} ·{" "}
                        <Link className="hover:text-cyan-300" href={`/wallet/${w.wallet}?lang=${narrativeLang}`}>
                          {labelFor(w.wallet)}
                        </Link>
                      </p>
                      <p className="font-mono text-[11px] text-gray-500 truncate">{w.wallet}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded border shrink-0 ${w.decision.tone}`}>{w.decision.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                    <span>Win {w.winRate.toFixed(1)}%</span>
                    <span>ROI† {Number(w.roi30dVsAvgSize || 0).toFixed(2)}×</span>
                    <span>Trades {w.totalTrades ?? "—"}</span>
                    <span className="text-gray-500">{w.lastSeen ? formatDateTime(w.lastSeen) : "—"}</span>
                  </div>
                  {w.profile ? (
                    <div className="space-y-1">
                      <p className="text-[11px] text-gray-400">
                        WR real: 5m {Number(w.profile.winRateReal5m || 0).toFixed(1)}% · 30m{" "}
                        {Number(w.profile.winRateReal30m || 0).toFixed(1)}% · 2h {Number(w.profile.winRateReal2h || 0).toFixed(1)}%
                      </p>
                      {hasLowHorizonSample(w.profile) ? (
                        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-200">
                          Low sample (n&lt;{MIN_HORIZON_SAMPLE})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-emerald-300 text-sm font-mono">+${formatUsdWhole(w.pnl30d)} 30d</p>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/wallet/${w.wallet}?lang=${narrativeLang}#behavior-memory`}
                        className="text-[11px] px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                      >
                        Behavior
                      </Link>
                      <button
                        type="button"
                        onClick={() => setExpandedWallet((v) => (v === w.wallet ? "" : w.wallet))}
                        className="text-[11px] px-2 py-1 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                      >
                        Why this wallet
                      </button>
                    </div>
                  </div>
                  {w.bestTradePct != null ? (
                    <p className="text-[11px] text-gray-400">
                      Best signal: <span className="text-emerald-300">+{w.bestTradePct.toFixed(1)}%</span>
                      {w.bestTradeMint ? (
                        <>
                          {" "}
                          on{" "}
                          <Link href={`/token/${w.bestTradeMint}`} className="text-cyan-300 hover:underline mono">
                            …{w.bestTradeMint.slice(-4)}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {expandedWallet === w.wallet ? (
                    <WalletNarrativeCard walletAddress={w.wallet} lang={narrativeLang} />
                  ) : null}
                </article>
              ))}
            </section>
          </>
        ) : null}

        <section className="glass-card sl-inset space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="sl-label inline-flex items-center gap-2 text-gray-200">
              <Radio size={14} className="text-purple-300" />
              Recent activity
            </p>
            <button
              type="button"
              onClick={() => activity.refetch()}
              className="text-xs text-cyan-400 hover:underline"
            >
              Refresh feed
            </button>
          </div>
          {activity.isLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-6">
              <Loader2 className="animate-spin" size={18} />
              Loading latest touches…
            </div>
          ) : null}
          {activity.isError ? (
            <p className="text-sm text-red-300">{activity.error?.message || "Activity unavailable."}</p>
          ) : null}
          {!activity.isLoading && !activity.isError && actRows.length === 0 ? (
            <p className="text-sm text-gray-500">No recent rows in smart_wallet_signals.</p>
          ) : null}
          {!activity.isLoading && !activity.isError && actRows.length > 0 ? (
            <ul className="divide-y divide-white/[0.06] border border-white/[0.06] rounded-xl overflow-hidden">
              {actRows.map((r) => (
                <li key={`${r.wallet}-${r.token}-${r.createdAt}`} className="px-3 py-2.5 flex flex-wrap gap-2 text-sm bg-white/[0.015]">
                  <span className="mono text-gray-200 text-xs">{r.wallet?.slice(0, 4)}…{r.wallet?.slice(-4)}</span>
                  <span
                    className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded border ${
                      String(r.side).toLowerCase().includes("sell")
                        ? "border-red-500/30 text-red-200 bg-red-500/10"
                        : "border-emerald-500/30 text-emerald-200 bg-emerald-500/10"
                    }`}
                  >
                    {r.side}
                  </span>
                  <Link href={`/token/${r.token}`} className="text-cyan-300 hover:underline mono text-xs truncate max-w-[200px]">
                    {r.token?.slice(0, 4)}…{r.token?.slice(-4)}
                  </Link>
                  <span className="text-gray-500 text-xs ml-auto tabular-nums">
                    {r.createdAt ? formatDateTime(r.createdAt) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </>
  );
}
