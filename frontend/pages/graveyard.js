import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "wins", label: "Wins ✓" },
  { id: "losses", label: "Losses ✗" },
  { id: "pending", label: "Pending ⏳" }
];

async function fetchTrackRecord(filter) {
  const qs = new URLSearchParams();
  qs.set("filter", filter || "all");
  qs.set("limit", "25");
  const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/track-record?${qs.toString()}`);
  if (!res.ok) throw new Error("track_record_fetch_failed");
  return res.json();
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

function Stat({ label, value, hint }) {
  return (
    <div className="border border-white/[0.08] bg-black/25 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-sl-muted font-semibold">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-sl-text">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-sl-muted">{hint}</p> : null}
    </div>
  );
}

function confidenceTone(label) {
  if (label === "HIGH") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (label === "BUILDING") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-slate-500/25 bg-slate-500/10 text-slate-300";
}

function outcomeTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "text-slate-500";
  if (n > 0) return "text-emerald-300";
  if (n < 0) return "text-red-300";
  return "text-slate-300";
}

function resultLabel(row) {
  if (row.result === "WIN") return "✓ WIN";
  if (row.result === "LOSS") return "✗ LOSS";
  if (row.result === "NEUTRAL") return "NEUTRAL";
  if (row.result === "MISSING") return "Data missing";
  return "Validating...";
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
        <p className="text-[10px] uppercase tracking-[0.18em] text-sl-muted font-semibold">
          Oracle calibration
        </p>
        <p className="font-mono text-[11px] text-sl-sub tabular-nums">
          {r}/{t} resolved · {Math.max(0, t - r)} pending
        </p>
      </div>
      <div className="mt-3 space-y-2.5">
        {CALIBRATION_MILESTONES.map((m) => {
          const pctRaw = (r / m.target) * 100;
          const reached = r >= m.target;
          const widthPct = Math.min(100, Math.max(0, pctRaw));
          const tone = reached
            ? "bg-emerald-400"
            : widthPct > 50
              ? "bg-violet-400"
              : "bg-amber-400";
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
    queryKey: ["verified-track-record", filter],
    queryFn: () => fetchTrackRecord(filter),
    refetchInterval: 60000
  });

  const data = query.data || {};
  const rows = useMemo(() => data.recent_signals || [], [data.recent_signals]);
  const rules = useMemo(() => data.rule_performance || [], [data.rule_performance]);
  const bestCalls = useMemo(() => data.top_wins || [], [data.top_wins]);
  const worstCalls = useMemo(() => data.worst_losses || [], [data.worst_losses]);
  const autoDiscovered = useMemo(() => data.auto_discovered_wallets || [], [data.auto_discovered_wallets]);
  const totalSignals = Number(data.total_signals || 0);
  const resolvedSignals = Number(data.resolved_signals || 0);
  const hasMetrics = resolvedSignals >= 10;
  const hasData = totalSignals > 0 || rules.length > 0;

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
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Total signals" value={hasData ? int(totalSignals) : "Accumulating"} />
            <Stat label="Win rate 60m" value={hasMetrics && data.win_rate_60m != null ? pct(data.win_rate_60m) : "Accumulating"} />
            <Stat label="Avg return" value={hasMetrics && data.avg_return != null ? pct(data.avg_return) : "Accumulating"} />
            <Stat label="Best call" value={data.best_call ? pct(data.best_call.outcome_60m) : "Accumulating"} hint={data.best_call?.symbol || data.best_call?.token} />
            <Stat label="Worst call" value={data.worst_call ? pct(data.worst_call.outcome_60m) : "Accumulating"} hint={data.worst_call?.symbol || data.worst_call?.token} />
          </div>
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          {hasMetrics ? (
            <>
              <Stat label="Win rate 60m" value={data.win_rate_60m != null ? pct(data.win_rate_60m) : "—"} hint={`n=${int(resolvedSignals)}`} />
              <Stat label="Avg return on wins" value={data.avg_return_wins != null ? pct(data.avg_return_wins) : "—"} />
              <Stat label="Max drawdown" value={data.max_drawdown != null ? pct(data.max_drawdown) : "—"} />
            </>
          ) : (
            <div className="lg:col-span-3">
              <EmptyState>Building track record — metrics appear after 10 validated signals.</EmptyState>
            </div>
          )}
          <div className="lg:col-span-3 text-[11px] text-sl-muted">Last updated: {time(data.last_updated)}</div>
        </section>

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
                    <th className="text-right py-2 pl-3">Confidence Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.rule_id} className={`border-b ${ruleTone(r.win_rate)} border-white/[0.06]`}>
                      <td className="py-3 pr-3 font-mono text-cyan-200">{r.rule_id}</td>
                      <td className="py-3 px-3 text-right font-mono text-sl-sub">{int(r.total_signals)}</td>
                      <td className="py-3 px-3 text-right font-mono text-sl-sub">{r.win_rate != null ? pct(r.win_rate) : "—"}</td>
                      <td className="py-3 px-3 text-right font-mono text-sl-sub">{r.avg_return != null ? pct(r.avg_return) : "—"}</td>
                      <td className="py-3 px-3 text-sl-sub">{r.best_regime || "—"}</td>
                      <td className="py-3 pl-3 text-right">
                        <span className={`inline-flex border px-2 py-1 text-[10px] font-bold ${confidenceTone(r.confidence_badge)}`}>
                          {r.confidence_badge}
                        </span>
                      </td>
                    </tr>
                  ))}
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
              <div className="hidden lg:grid grid-cols-[1.1fr_1.1fr_0.9fr_0.75fr_0.8fr_0.7fr_0.7fr_0.7fr_0.9fr] gap-2 px-3 text-[10px] uppercase tracking-[0.14em] text-sl-muted">
                <span>Time</span><span>Token</span><span>Symbol</span><span>Strength</span><span>Action</span><span>5m</span><span>15m</span><span>60m</span><span>Result</span>
              </div>
              {rows.map((r) => (
                <div key={r.id} className={`border px-3 py-3 ${rowTone(r.result)}`}>
                  <div className="grid lg:grid-cols-[1.1fr_1.1fr_0.9fr_0.75fr_0.8fr_0.7fr_0.7fr_0.7fr_0.9fr] gap-2 items-center text-xs">
                    <span className="text-sl-muted">{time(r.time)}</span>
                    <Link href={`/token/${encodeURIComponent(r.token || "")}`} className="font-mono text-cyan-200 no-underline break-all">
                      {r.token_name || r.token || "—"}
                    </Link>
                    <span className="font-mono text-sl-sub">{r.symbol || "—"}</span>
                    <span className="font-mono text-sl-sub">{Number(r.strength || 0).toFixed(2)}</span>
                    <span className="text-sl-sub">{r.action || "—"}</span>
                    <span className={`font-mono ${outcomeTone(r.outcome_5m)}`}>{r.outcome_5m != null ? pct(r.outcome_5m) : "Validating..."}</span>
                    <span className={`font-mono ${outcomeTone(r.outcome_15m)}`}>{r.outcome_15m != null ? pct(r.outcome_15m) : "Validating..."}</span>
                    <span className={`font-mono ${outcomeTone(r.outcome_60m)}`}>{r.outcome_60m != null ? pct(r.outcome_60m) : "Validating..."}</span>
                    <span className="font-semibold text-sl-sub">{resultLabel(r)}</span>
                  </div>
                </div>
              ))}
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
                    <p className="text-xs text-sl-muted mt-1">{time(r.time)} · suggested {r.action} · Smart money was early by {r.smart_money_early_min || "—"}min</p>
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
                    <p className="text-xs text-sl-muted mt-1">{time(r.time)} · suggested {r.action} · Why this happens: regime mismatch / thin liquidity / low sample rule.</p>
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
