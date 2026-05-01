import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "wins", label: "Wins ✓" },
  { id: "losses", label: "Losses ✗" },
  { id: "pending", label: "Pending ⏳" }
];

/** Cap pages to avoid flooding the API on very large ledgers. */
const METRICS_MAX_PAGES = 40;

async function fetchTrackRecordPage(page, limit = 50) {
  const qs = new URLSearchParams();
  qs.set("filter", "all");
  qs.set("limit", String(limit));
  qs.set("page", String(page));
  const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/track-record?${qs.toString()}`);
  if (!res.ok) throw new Error("track_record_fetch_failed");
  return res.json();
}

async function fetchTrackRecordFull() {
  const limit = 50;
  const first = await fetchTrackRecordPage(1, limit);
  const totalPagesRaw = Number(first.pagination?.total_pages || 1);
  const totalPages = Math.min(Math.max(1, totalPagesRaw), METRICS_MAX_PAGES);
  const merged = [...(first.recent_signals || [])];
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => fetchTrackRecordPage(i + 2, limit))
    );
    for (const body of rest) {
      merged.push(...(body.recent_signals || []));
    }
  }
  const byId = new Map();
  merged.forEach((s, idx) => {
    const k = s?.id != null ? s.id : `row-${idx}-${String(s?.time || s?.token || "")}`;
    if (!byId.has(k)) byId.set(k, s);
  });
  return {
    ...first,
    recent_signals: [...byId.values()],
    _pagesFetched: totalPages
  };
}

function outcomeRaw(s) {
  if (s?.result_pct != null && Number.isFinite(Number(s.result_pct))) return Number(s.result_pct);
  if (s?.outcome_60m != null && Number.isFinite(Number(s.outcome_60m))) return Number(s.outcome_60m);
  return null;
}

function pct(v, unit = true) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const value = unit ? n * 100 : n;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function int(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function time(raw) {
  const t = raw ? new Date(raw) : null;
  if (!t || Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function rowTone(result) {
  if (result === "WIN") return "border-emerald-500/20 bg-emerald-500/[0.055]";
  if (result === "LOSS") return "border-red-500/20 bg-red-500/[0.045]";
  if (result === "NEUTRAL") return "border-slate-500/20 bg-slate-500/[0.035]";
  return "border-slate-500/20 bg-white/[0.025]";
}

function ruleTone(winRate) {
  const n = Number(winRate);
  if (!Number.isFinite(n)) return "border-white/[0.08]";
  if (n > 0.65) return "border-emerald-500/25 bg-emerald-500/[0.04]";
  if (n >= 0.45) return "border-amber-500/25 bg-amber-500/[0.04]";
  return "border-red-500/25 bg-red-500/[0.04]";
}

function Stat({ label, value, hint, className = "", valueClassName = "" }) {
  return (
    <div className={`border border-white/[0.08] bg-black/25 px-3 py-2 ${className}`}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-sl-muted font-semibold">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold text-sl-text ${valueClassName}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-sl-muted">{hint}</p> : null}
    </div>
  );
}

function outcomeTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "text-slate-500";
  if (n > 0) return "text-emerald-300";
  if (n < 0) return "text-red-300";
  return "text-slate-300";
}

function ruleConfidence(count, wr) {
  const c = Math.max(0, Number(count) || 0);
  const w = Number(wr);
  if (c < 10) return { label: "Gathering data", cls: "text-sl-muted" };
  if (c < 30) return { label: "Low confidence", cls: "text-orange-400" };
  if (c < 50) return { label: "Moderate", cls: "text-blue-400" };
  if (c >= 50 && Number.isFinite(w) && w > 0.45) return { label: "High confidence", cls: "text-emerald-400" };
  if (c >= 50 && Number.isFinite(w) && w > 0 && w <= 0.45) return { label: "Low edge", cls: "text-orange-400" };
  return { label: "Low confidence", cls: "text-orange-400" };
}

function computeInstitutionalMetrics(signals) {
  const completed = (signals ?? []).filter((s) => outcomeRaw(s) != null);
  const wins = completed.filter((s) => (outcomeRaw(s) ?? 0) > 0);
  const losses = completed.filter((s) => (outcomeRaw(s) ?? 0) <= 0);
  const winRate = completed.length > 0 ? wins.length / completed.length : 0;
  const lossRate = 1 - winRate;
  const avgWinPct =
    wins.length > 0 ? wins.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / wins.length : 0;
  const avgLossPct =
    losses.length > 0 ? losses.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / losses.length : 0;
  const expectancy = winRate * avgWinPct + lossRate * avgLossPct;
  const profitFactor =
    losses.length > 0 && wins.length > 0
      ? Math.abs(wins.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0)) /
        Math.abs(losses.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0))
      : 0;
  const maxDrawdown = completed.length > 0 ? Math.min(...completed.map((s) => outcomeRaw(s) ?? 0)) : 0;
  const cappedCompleted = completed.map((s) => ({
    ...s,
    _r: Math.max(outcomeRaw(s) ?? 0, -0.1)
  }));
  const cappedWins = cappedCompleted.filter((s) => s._r > 0);
  const cappedLosses = cappedCompleted.filter((s) => s._r <= 0);
  const cappedWinRate = cappedCompleted.length > 0 ? cappedWins.length / cappedCompleted.length : 0;
  const cappedAvgWin =
    cappedWins.length > 0 ? cappedWins.reduce((a, s) => a + s._r, 0) / cappedWins.length : 0;
  const cappedAvgLoss =
    cappedLosses.length > 0 ? cappedLosses.reduce((a, s) => a + s._r, 0) / cappedLosses.length : 0;
  const cappedExpectancy = cappedWinRate * cappedAvgWin + (1 - cappedWinRate) * cappedAvgLoss;
  const sorted = [...completed].sort((a, b) => (outcomeRaw(b) ?? 0) - (outcomeRaw(a) ?? 0));
  const bestCall = sorted[0] ?? null;
  const worstCall = sorted[sorted.length - 1] ?? null;
  return {
    completed,
    wins,
    losses,
    winRate,
    avgWinPct,
    avgLossPct,
    expectancy,
    profitFactor,
    maxDrawdown,
    cappedExpectancy,
    bestCall,
    worstCall
  };
}

function callLabel(s) {
  if (!s) return "—";
  const raw = outcomeRaw(s);
  const sym = s.symbol ?? s.asset?.slice(0, 8) ?? (s.mint ? String(s.mint).slice(0, 6) : null) ?? "???";
  if (raw == null || !Number.isFinite(raw)) return `${sym} —`;
  const nPct = raw * 100;
  const sign = nPct > 0 ? "+" : "";
  return `${sym} ${sign}${nPct.toFixed(1)}%`;
}

function regimeKey(s) {
  const r = String(s.regime ?? s.emission_regime ?? s.gate_meta?.regime ?? "unknown").toLowerCase();
  if (["calm", "trending", "volatile"].includes(r)) return r;
  return "unknown";
}

function regimeBreakdown(completed) {
  const regimes = ["calm", "trending", "volatile", "unknown"];
  return regimes
    .map((r) => {
      const group = completed.filter((s) => regimeKey(s) === r);
      if (group.length === 0) return null;
      const gWins = group.filter((s) => (outcomeRaw(s) ?? 0) > 0);
      const gLosses = group.filter((s) => (outcomeRaw(s) ?? 0) <= 0);
      const gWinRate = gWins.length / group.length;
      const gAvgRet = group.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / group.length;
      const avgGw = gWins.length > 0 ? gWins.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / gWins.length : 0;
      const avgGl =
        gLosses.length > 0 ? gLosses.reduce((a, s) => a + (outcomeRaw(s) ?? 0), 0) / gLosses.length : 0;
      const gExp = gWinRate * avgGw + (1 - gWinRate) * avgGl;
      return { regime: r, count: group.length, winRate: gWinRate, avgRet: gAvgRet, expectancy: gExp };
    })
    .filter(Boolean);
}

function resultBadgeMeta(row) {
  const res = row.result;
  if (res === "WIN")
    return { label: "WIN", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" };
  if (res === "LOSS") return { label: "LOSS", cls: "border-red-500/40 bg-red-500/15 text-red-200" };
  if (res === "PENDING")
    return { label: "PENDING", cls: "border-white/15 bg-white/[0.06] text-slate-400" };
  if (res === "MISSING") return { label: "FAILED", cls: "border-orange-500/40 bg-orange-500/15 text-orange-200" };
  if (res === "NEUTRAL")
    return { label: "NEUTRAL", cls: "border-slate-500/40 bg-slate-500/10 text-slate-300" };
  return { label: "PENDING", cls: "border-white/15 bg-white/[0.06] text-slate-400" };
}

function tokenDisplaySym(row) {
  const sym = row.symbol?.replace(/^\$/, "") || "";
  if (sym) return sym;
  if (row.token || row.mint) {
    const m = String(row.token || row.mint);
    return `${m.slice(0, 4)}…${m.slice(-4)}`;
  }
  return "—";
}

function filterRows(rows, filterId) {
  if (filterId === "all") return rows;
  if (filterId === "wins") return rows.filter((r) => r.result === "WIN");
  if (filterId === "losses") return rows.filter((r) => r.result === "LOSS");
  if (filterId === "pending") return rows.filter((r) => r.result === "PENDING" || r.result === "MISSING");
  return rows;
}

function EmptyState({ children }) {
  return (
    <div className="border border-white/[0.08] bg-white/[0.025] px-4 py-5 text-sm text-sl-sub">
      {children}
    </div>
  );
}

const CALIBRATION_MILESTONES = [
  { id: "first_metric", target: 10, label: "First metric", description: "Win rate / avg return become visible" },
  { id: "rule_confidence", target: 30, label: "Rule confidence", description: "Per-rule weights start adapting" },
  { id: "mature", target: 80, label: "Mature calibration", description: "Validation Oracle fully operational" }
];

function CalibrationProgress({ resolved, total }) {
  const r = Math.max(0, Number(resolved) || 0);
  const t = Math.max(r, Number(total) || 0);
  return (
    <div className="mt-4 border border-white/[0.08] bg-black/30 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-sl-muted font-semibold">Oracle calibration</p>
        <p className="font-mono text-[11px] text-sl-sub tabular-nums">
          {r}/{t} resolved · {Math.max(0, t - r)} pending
        </p>
      </div>
      <div className="mt-3 space-y-2.5">
        {CALIBRATION_MILESTONES.map((m) => {
          const pctRaw = (r / m.target) * 100;
          const reached = r >= m.target;
          const widthPct = Math.min(100, Math.max(0, pctRaw));
          const tone = reached ? "bg-emerald-400" : widthPct > 50 ? "bg-violet-400" : "bg-amber-400";
          return (
            <div key={m.id}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={`font-semibold ${reached ? "text-emerald-200" : "text-sl-sub"}`}>
                  {reached ? "✓ " : ""}
                  {m.label}
                </span>
                <span className="font-mono tabular-nums text-sl-muted">
                  {Math.min(r, m.target)}/{m.target}
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-white/[0.05] overflow-hidden">
                <div
                  className={`h-full ${tone} transition-[width] duration-700 ease-out`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-sl-muted">{m.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function VerifiedTrackRecordPage() {
  const { t } = useLocale();
  const [filter, setFilter] = useState("all");

  const query = useQuery({
    queryKey: ["verified-track-record-full"],
    queryFn: fetchTrackRecordFull,
    refetchInterval: 60000
  });

  const data = query.data || {};
  const allRows = useMemo(() => data.recent_signals || [], [data.recent_signals]);
  const rules = useMemo(() => data.rule_performance || [], [data.rule_performance]);
  const bestCalls = useMemo(() => data.top_wins || [], [data.top_wins]);
  const worstCalls = useMemo(() => data.worst_losses || [], [data.worst_losses]);
  const autoDiscovered = useMemo(() => data.auto_discovered_wallets || [], [data.auto_discovered_wallets]);
  const totalSignals = Number(data.total_signals || 0);
  const resolvedSignals = Number(data.resolved_signals || 0);
  const hasData = totalSignals > 0 || rules.length > 0;

  const metrics = useMemo(() => computeInstitutionalMetrics(allRows), [allRows]);
  const {
    completed,
    winRate,
    avgWinPct,
    avgLossPct,
    expectancy,
    profitFactor,
    maxDrawdown,
    cappedExpectancy,
    bestCall,
    worstCall
  } = metrics;

  const rows = useMemo(() => filterRows(allRows, filter), [allRows, filter]);
  const byRegime = useMemo(() => regimeBreakdown(completed), [completed]);
  const hasMetrics = completed.length > 0;

  const expCardClass =
    expectancy > 0
      ? "border-emerald-500/30 bg-emerald-500/10"
      : hasMetrics
        ? "border-red-500/30 bg-red-500/10"
        : "";
  const expValueClass = !hasMetrics ? "" : expectancy > 0 ? "text-emerald-200" : "text-red-200";

  return (
    <>
      <PageHead title="Verified Track Record — Sentinel Ledger" description="Every signal, every outcome, nothing hidden." />
      <div className="sl-container py-8 space-y-6">
        <section className="glass-card sl-inset border-violet-500/20 bg-violet-500/[0.025]">
          <p className="sl-label">{t("terminal.lexicon.verifiedTrackRecord")}</p>
          <h1 className="text-3xl font-semibold text-sl-text mt-1">Sentinel Verified Track Record</h1>
          <p className="text-sm text-sl-sub mt-2 max-w-3xl leading-relaxed">
            Every signal. Every outcome. Nothing hidden.
          </p>
          <p className="mt-1 text-xs text-cyan-100/70">
            Data sourced directly from on-chain events and Sentinel Oracle validation.
          </p>
          {resolvedSignals < 80 ? (
            <CalibrationProgress resolved={resolvedSignals} total={totalSignals} />
          ) : null}

          {expectancy < 0 && hasMetrics ? (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 mt-6">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="text-sm font-bold text-red-200 uppercase tracking-wider">
                  System Expectancy Negative ({(expectancy * 100).toFixed(2)}%)
                </p>
                <p className="text-xs text-red-300/80 mt-1">
                  Sentinel is finding winners (Win rate {(winRate * 100).toFixed(1)}%) but losses are larger than
                  gains (Avg loss {(avgLossPct * 100).toFixed(2)}%). Do not mirror signals without a strict −10% hard
                  stop-loss.
                </p>
                <p className="text-xs text-red-300/60 mt-1">
                  Simulated with −10% cap: {(cappedExpectancy * 100).toFixed(2)}%
                  {cappedExpectancy > 0 ? " — positive with discipline" : ""}
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Total signals" value={hasData ? int(completed.length) : "Accumulating"} />
            <Stat
              label="Win rate"
              value={hasMetrics ? `${(winRate * 100).toFixed(1)}%` : "Accumulating"}
            />
            <Stat
              label="Expectancy"
              value={hasMetrics ? `${(expectancy * 100).toFixed(2)}%` : "Accumulating"}
              className={expCardClass}
              valueClassName={expValueClass}
            />
            <Stat
              label="Avg win"
              value={hasMetrics ? pct(avgWinPct) : "Accumulating"}
              className="border-emerald-500/25 bg-emerald-500/[0.06]"
              valueClassName="text-emerald-200"
            />
            <Stat
              label="Avg loss"
              value={hasMetrics ? `${(avgLossPct * 100).toFixed(2)}%` : "Accumulating"}
              className="border-red-500/25 bg-red-500/[0.06]"
              valueClassName="text-red-300"
            />
            <Stat
              label="Profit factor"
              value={hasMetrics && profitFactor > 0 ? profitFactor.toFixed(2) : hasMetrics ? "—" : "Accumulating"}
            />
            <Stat
              label="Max drawdown"
              value={hasMetrics ? pct(maxDrawdown) : "Accumulating"}
              className="border-red-500/25 bg-red-500/[0.06]"
              valueClassName="text-red-300"
            />
            <Stat label="Best call" value={hasMetrics ? callLabel(bestCall) : "Accumulating"} hint={worstCall ? `Worst: ${callLabel(worstCall)}` : null} />
          </div>
          {query.isFetching && !query.data ? (
            <p className="mt-2 text-[11px] text-sl-muted">Loading ledger…</p>
          ) : null}
        </section>

        {byRegime.length > 0 ? (
          <section className="glass-card sl-inset border-white/[0.08] bg-[#080a0d]/90">
            <p className="sl-label">Regime breakdown</p>
            <h2 className="text-xl font-semibold text-sl-text mt-1">Performance by market regime</h2>
            <p className="text-xs text-sl-muted mt-1">Completed signals only (same sample as expectancy).</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-[0.14em] text-sl-muted">
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left py-2 pr-3">Regime</th>
                    <th className="text-right py-2 px-3">Signals</th>
                    <th className="text-right py-2 px-3">Win rate</th>
                    <th className="text-right py-2 px-3">Avg return</th>
                    <th className="text-right py-2 pl-3">Expectancy</th>
                  </tr>
                </thead>
                <tbody>
                  {byRegime.map((g) => (
                    <tr key={g.regime} className="border-b border-white/[0.06]">
                      <td className="py-2.5 pr-3 font-mono text-cyan-200 capitalize">{g.regime}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-sl-sub">{int(g.count)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-sl-sub">{(g.winRate * 100).toFixed(1)}%</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${outcomeTone(g.avgRet)}`}>
                        {pct(g.avgRet)}
                      </td>
                      <td className={`py-2.5 pl-3 text-right font-mono ${outcomeTone(g.expectancy)}`}>
                        {(g.expectancy * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="text-[11px] text-sl-muted">Last updated: {time(data.last_updated)}</div>

        <section className="glass-card sl-inset border-white/[0.08] bg-[#080a0d]/90">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="sl-label">Rule Performance</p>
              <h2 className="text-xl font-semibold text-sl-text">Rules ranked by verified confidence</h2>
            </div>
          </div>
          {!rules.length ? (
            <EmptyState>Oracle is validating first signals — rule performance appears after 10+ resolved outcomes per rule.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-[0.14em] text-sl-muted">
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left py-2 pr-3">Rule ID</th>
                    <th className="text-right py-2 px-3">Total Signals</th>
                    <th className="text-right py-2 px-3">Win Rate</th>
                    <th className="text-right py-2 px-3">Avg Return</th>
                    <th className="text-left py-2 px-3">Best Regime</th>
                    <th className="text-right py-2 pl-3">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const conf = ruleConfidence(r.total_signals, r.win_rate);
                    return (
                      <tr key={r.rule_id} className={`border-b ${ruleTone(r.win_rate)} border-white/[0.06]`}>
                        <td className="py-3 pr-3 font-mono text-cyan-200">{r.rule_id}</td>
                        <td className="py-3 px-3 text-right font-mono text-sl-sub">{int(r.total_signals)}</td>
                        <td className="py-3 px-3 text-right font-mono text-sl-sub">{r.win_rate != null ? pct(r.win_rate) : "—"}</td>
                        <td className="py-3 px-3 text-right font-mono text-sl-sub">{r.avg_return != null ? pct(r.avg_return) : "—"}</td>
                        <td className="py-3 px-3 text-sl-sub">{r.best_regime || "—"}</td>
                        <td className="py-3 pl-3 text-right">
                          <span className={`inline-flex border border-white/10 px-2 py-1 text-[10px] font-bold ${conf.cls}`}>
                            {conf.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="glass-card sl-inset border-white/[0.08] bg-[#080a0d]/90">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <p className="sl-label">Complete Signal History</p>
              <h2 className="text-xl font-semibold text-sl-text">Every call we made. Unedited.</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`h-9 px-3 border text-xs font-semibold transition ${
                    filter === f.id
                      ? "border-violet-500/40 bg-violet-500/15 text-violet-100"
                      : "border-white/[0.08] bg-white/[0.03] text-sl-sub hover:text-sl-sub"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {!rows.length ? (
            <EmptyState>{hasData ? "No signals match this filter." : "Oracle is validating signals — first results in 24-48h."}</EmptyState>
          ) : (
            <div className="space-y-2">
              <div className="hidden lg:grid grid-cols-[0.95fr_1fr_0.65fr_0.75fr_0.55fr_0.55fr_0.55fr_0.65fr_0.85fr] gap-2 px-3 text-[10px] uppercase tracking-[0.14em] text-sl-muted">
                <span>Time</span>
                <span>Token</span>
                <span>Action</span>
                <span>Regime</span>
                <span>5m</span>
                <span>15m</span>
                <span>60m</span>
                <span>Result</span>
                <span>P/L 60m</span>
              </div>
              {rows.map((r) => {
                const badge = resultBadgeMeta(r);
                const raw60 = outcomeRaw(r);
                const pendingStyle = r.result === "PENDING";
                return (
                  <div key={r.id} className={`border px-3 py-3 ${rowTone(r.result)}`}>
                    <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-[0.95fr_1fr_0.65fr_0.75fr_0.55fr_0.55fr_0.55fr_0.65fr_0.85fr] lg:gap-2 lg:items-center text-xs">
                      <span className="text-sl-muted">{time(r.time)}</span>
                      <Link
                        href={`/token/${encodeURIComponent(r.token || "")}`}
                        className="font-mono text-cyan-200 no-underline break-all"
                      >
                        {tokenDisplaySym(r)}
                      </Link>
                      <span className="font-semibold text-sl-sub uppercase tracking-wide">{r.action || "—"}</span>
                      <span className="font-mono text-[10px] text-sl-muted capitalize">{regimeKey(r)}</span>
                      <span className={`font-mono ${outcomeTone(r.outcome_5m)}`}>
                        {r.outcome_5m != null ? pct(r.outcome_5m) : pendingStyle ? "validating…" : "—"}
                      </span>
                      <span className={`font-mono ${outcomeTone(r.outcome_15m)}`}>
                        {r.outcome_15m != null ? pct(r.outcome_15m) : pendingStyle ? "validating…" : "—"}
                      </span>
                      <span className={`font-mono ${outcomeTone(r.outcome_60m)}`}>
                        {r.outcome_60m != null ? pct(r.outcome_60m) : pendingStyle ? "validating…" : "—"}
                      </span>
                      <span className={`inline-flex w-fit border px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className={`font-mono font-semibold ${outcomeTone(raw60)}`}>
                        {raw60 != null ? pct(raw60) : pendingStyle ? "validating…" : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid lg:grid-cols-2 gap-4">
          <section className="glass-card sl-inset border-emerald-500/20 bg-emerald-500/[0.025]">
            <p className="sl-label">Sentinel&apos;s Best Calls</p>
            <h2 className="text-xl font-semibold text-sl-text">When the Oracle was right.</h2>
            <p className="mt-1 text-sm text-sl-muted">This is what Sentinel caught before the market moved.</p>
            {!bestCalls.length ? (
              <p className="text-sm text-sl-muted mt-4">Accumulating verified wins. Showing {bestCalls.length} of 5 available calls.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {bestCalls.map((r) => (
                  <Link key={r.id} href={`/token/${encodeURIComponent(r.token || "")}`} className="block border border-white/[0.08] bg-black/20 px-3 py-2 no-underline">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-mono text-cyan-200 break-all">{r.token_name || r.symbol || r.token}</span>
                      <span className="font-mono text-emerald-300">{pct(r.outcome_60m)}</span>
                    </div>
                    <p className="text-xs text-sl-muted mt-1">
                      {time(r.time)} · suggested {r.action} · Smart money was early by {r.smart_money_early_min || "—"}min
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section className="glass-card sl-inset border-red-500/20 bg-red-500/[0.02]">
            <p className="sl-label">Where Sentinel Was Wrong</p>
            <h2 className="text-xl font-semibold text-sl-text">We show our mistakes. That&apos;s what makes this different from every other platform.</h2>
            {!worstCalls.length ? (
              <p className="text-sm text-sl-muted mt-4">No resolved losses yet — accumulating history.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {worstCalls.map((r) => (
                  <Link key={r.id} href={`/token/${encodeURIComponent(r.token || "")}`} className="block border border-white/[0.08] bg-black/20 px-3 py-2 no-underline">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-mono text-cyan-200 break-all">{r.token_name || r.symbol || r.token}</span>
                      <span className="font-mono text-red-300">{pct(r.outcome_60m)}</span>
                    </div>
                    <p className="text-xs text-sl-muted mt-1">
                      {time(r.time)} · suggested {r.action} · Drawdown shown in full — no smoothing.
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {autoDiscovered.length ? (
          <section className="glass-card sl-inset border-white/[0.08] bg-[#080a0d]/90">
            <div className="mb-4">
              <p className="sl-label">Auto-discovered wallets</p>
              <h2 className="text-xl font-semibold text-sl-text">Smart wallets surfaced by the engine, not curated.</h2>
              <p className="mt-1 text-sm text-sl-muted">Promoted from candidates after closing real round-trip cycles on validated signals.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-[0.14em] text-sl-muted">
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left py-2 pr-3">Wallet</th>
                    <th className="text-right py-2 px-3">Win rate</th>
                    <th className="text-right py-2 px-3">Closed trades</th>
                    <th className="text-right py-2 pl-3">Promoted</th>
                  </tr>
                </thead>
                <tbody>
                  {autoDiscovered.map((w) => (
                    <tr key={w.wallet} className="border-b border-white/[0.06]">
                      <td className="py-3 pr-3 font-mono text-cyan-200 break-all">
                        <Link href={`/wallet/${encodeURIComponent(w.wallet)}`} className="text-cyan-200 no-underline">
                          {w.wallet.slice(0, 6)}…{w.wallet.slice(-4)}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-sl-sub">{w.win_rate != null ? `${Number(w.win_rate).toFixed(1)}%` : "—"}</td>
                      <td className="py-3 px-3 text-right font-mono text-sl-sub">{w.total_trades != null ? int(w.total_trades) : "—"}</td>
                      <td className="py-3 pl-3 text-right font-mono text-sl-muted">{time(w.promoted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="glass-card sl-inset border-white/[0.08] bg-sl-card">
          <p className="sl-label">How Oracle Validates</p>
          <div className="mt-2 grid md:grid-cols-3 gap-3 text-sm text-sl-sub leading-relaxed">
            <p>Signals are validated at 5, 15, and 60 minutes after emission.</p>
            <p>Win = price increased &gt;5% within 60 minutes.</p>
            <p>All outcomes are calculated from on-chain price data, not manually curated.</p>
          </div>
          <p className="mt-4 text-sm font-semibold text-sl-sub">Nothing is cherry-picked. Nothing is deleted. This page updates automatically.</p>
        </section>
      </div>
    </>
  );
}
