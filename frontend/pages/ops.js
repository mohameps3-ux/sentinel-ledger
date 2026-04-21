import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { formatDateTime, formatInteger } from "../lib/formatStable";
import { PageHead } from "../components/seo/PageHead";

async function withOpsKey(path, opsKey, options = {}) {
  const res = await fetch(`${getPublicApiUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-ops-key": opsKey,
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "request_failed");
  return body;
}

function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v < 1024) return `${Math.round(v)} B`;
  const units = ["KB", "MB", "GB"];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x < 10 ? x.toFixed(1) : Math.round(x)} ${units[i]}`;
}

function formatPctUnit(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function topBreakdownEntry(breakdown = {}) {
  const entries = Object.entries(breakdown || {});
  if (!entries.length) return null;
  entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return entries[0];
}

function Sparkline({ points = [], stroke = "#22d3ee" }) {
  if (!Array.isArray(points) || points.length < 2) {
    return <div className="h-12 rounded-lg border border-white/[0.08] bg-[#0b0f13]/80" />;
  }
  const w = 260;
  const h = 46;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (w - 2) + 1;
      const y = h - ((p - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <div className="h-12 rounded-lg border border-white/[0.08] bg-[#0b0f13]/80 px-2 py-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" role="img" aria-label="sparkline">
        <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "ingestion", label: "Ingestion" },
  { id: "signals", label: "Signals" },
  { id: "operations", label: "Operations" }
];

function Kpi({ label, value, hint, tone = "neutral" }) {
  const border =
    tone === "good"
      ? "border-emerald-500/20"
      : tone === "warn"
        ? "border-amber-500/25"
        : tone === "bad"
          ? "border-red-500/25"
          : "border-white/[0.08]";
  return (
    <div className={`rounded-xl border ${border} bg-[#0b0f13]/80 p-3 min-w-0`}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold truncate">{label}</div>
      <div className="text-lg font-semibold text-gray-100 mt-1 tabular-nums truncate">{value}</div>
      {hint ? <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{hint}</div> : null}
    </div>
  );
}

function TabButton({ active, children, onClick, id }) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={`panel-${id}`}
      onClick={onClick}
      className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${
        active
          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
          : "border-white/[0.08] bg-white/[0.02] text-gray-400 hover:text-gray-200 hover:border-white/15"
      }`}
    >
      {children}
    </button>
  );
}

export default function OpsPage() {
  const [opsKey, setOpsKey] = useState("");
  const [tab, setTab] = useState("overview");
  const [tickets, setTickets] = useState([]);
  const [events, setEvents] = useState([]);
  const [guard, setGuard] = useState(null);
  const [perf, setPerf] = useState(null);
  const [calib, setCalib] = useState(null);
  const [freshness, setFreshness] = useState(null);
  const [freshnessHistory, setFreshnessHistory] = useState([]);
  const [sloSnapshot, setSloSnapshot] = useState(null);
  const [historyStatus, setHistoryStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [verifyPaste, setVerifyPaste] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("sentinel-ops-key");
    if (saved) setOpsKey(saved);
  }, []);

  const hasKey = useMemo(() => opsKey.trim().length > 0, [opsKey]);

  const saveKey = () => {
    localStorage.setItem("sentinel-ops-key", opsKey.trim());
    toast.success("Ops key saved locally.");
  };

  const loadData = async () => {
    if (!hasKey) return toast.error("Set your ops key first.");
    setLoading(true);
    try {
      const [ticketRes, eventRes, guardRes, perfRes, calibRes, freshRes, histRes, sloRes, histStatusRes] = await Promise.all([
        withOpsKey("/api/v1/bots/omni/tickets?limit=50", opsKey),
        withOpsKey("/api/v1/bots/omni/events?limit=100", opsKey),
        withOpsKey("/api/v1/ops/entropy-guard/snapshot", opsKey),
        withOpsKey("/api/v1/ops/signal-performance/summary?lookbackHours=48&maxRows=2000", opsKey),
        withOpsKey("/api/v1/ops/signal-performance/calibration", opsKey),
        withOpsKey("/api/v1/ops/data-freshness", opsKey),
        withOpsKey("/api/v1/ops/data-freshness/history?hours=168&endpoint=signalsLatest&limit=1000", opsKey),
        withOpsKey("/api/v1/ops/signals-supabase-slo/snapshot", opsKey),
        withOpsKey("/api/v1/ops/data-freshness/history/status", opsKey)
      ]);
      setTickets(ticketRes.data || []);
      setEvents(eventRes.data || []);
      setGuard(guardRes || null);
      setPerf(perfRes.data || null);
      setCalib(calibRes.data || null);
      setFreshness(freshRes.data || null);
      setFreshnessHistory(histRes.data?.rows || []);
      setSloSnapshot(sloRes || null);
      setHistoryStatus(histStatusRes.data || null);
      toast.success("Ops data refreshed.");
    } catch (error) {
      toast.error(`Load failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const setTicketStatus = async (ticketId, status) => {
    try {
      await withOpsKey(`/api/v1/bots/omni/tickets/${ticketId}`, opsKey, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status } : t)));
      toast.success("Ticket updated.");
    } catch (error) {
      toast.error(`Update failed: ${error.message}`);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    try {
      await withOpsKey("/api/v1/bots/omni/alerts/broadcast", opsKey, {
        method: "POST",
        body: JSON.stringify({
          title: "Sentinel Ops Broadcast",
          message: broadcastMsg.trim(),
          channels: ["telegram"],
          severity: "info"
        })
      });
      setBroadcastMsg("");
      toast.success("Broadcast sent.");
    } catch (error) {
      toast.error(`Broadcast failed: ${error.message}`);
    }
  };

  const downloadHistoryCsv = async (hours) => {
    if (!hasKey) return toast.error("Set your ops key first.");
    try {
      const url = `${getPublicApiUrl()}/api/v1/ops/data-freshness/history/export?hours=${hours}&endpoint=signalsLatest&limit=5000`;
      const res = await fetch(url, {
        headers: {
          "x-ops-key": opsKey.trim()
        }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "export_failed");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `signals-freshness-${hours}h.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success(`CSV ${hours}h downloaded.`);
    } catch (error) {
      toast.error(`CSV export failed: ${error.message}`);
    }
  };

  const downloadHistorySignedJson = async (hours) => {
    if (!hasKey) return toast.error("Set your ops key first.");
    try {
      const url = `${getPublicApiUrl()}/api/v1/ops/data-freshness/history/export/signed?hours=${hours}&endpoint=signalsLatest&limit=5000`;
      const res = await fetch(url, {
        headers: {
          "x-ops-key": opsKey.trim()
        }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "signed_export_failed");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `signals-freshness-signed-${hours}h.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success(`Signed JSON ${hours}h downloaded.`);
    } catch (error) {
      toast.error(`Signed export failed: ${error.message}`);
    }
  };

  const verifyPublicSignedExport = async () => {
    const raw = verifyPaste.trim();
    if (!raw) return toast.error("Paste a signed export JSON first.");
    if (raw.length > 3_500_000) return toast.error("Payload too large for this browser check.");
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const doc = JSON.parse(raw);
      const res = await fetch(`${getPublicApiUrl()}/api/v1/ops/verify-signed-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "verify_failed");
      setVerifyResult(body);
      toast.success(body.valid ? "PASS — integrity verified" : "FAIL — see details");
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON.");
      } else {
        toast.error(`Verify failed: ${error.message}`);
      }
    } finally {
      setVerifyBusy(false);
    }
  };

  const guardPressure = Boolean(guard?.alerts?.highIngestionPressure);
  const sustained = Boolean(guard?.alerts?.sustainedDrops);
  const memAlert = Boolean(guard?.alerts?.memoryPressure);

  const overviewGuardTone = guardPressure ? "bad" : sustained || memAlert ? "warn" : "good";
  const overviewGuardLabel = guardPressure
    ? "High pressure"
    : sustained || memAlert
      ? "Watch"
      : "Healthy";
  const signalsFresh = freshness?.signalsLatest || null;
  const supabaseRate24h = Number(signalsFresh?.supabaseSourceRate24h || 0);
  const sloTarget = Number(signalsFresh?.slo?.targetSupabaseRate || 0.8);
  const sloMet = Boolean(signalsFresh?.slo?.met);
  const topFallback = topBreakdownEntry(signalsFresh?.fallbackReasonBreakdown24h || {});
  const topProvider = topBreakdownEntry(signalsFresh?.providerUsedBreakdown24h || {});
  const historyRows = Array.isArray(freshnessHistory) ? freshnessHistory : [];
  const nowMs = Date.now();
  const rows24h = historyRows.filter((row) => nowMs - Date.parse(row.captured_at || 0) <= 24 * 60 * 60 * 1000);
  const supabaseSeries24h = rows24h
    .map((row) => Number(row.supabase_source_rate_24h))
    .filter((n) => Number.isFinite(n));
  const supabaseSeries7d = historyRows
    .map((row) => Number(row.supabase_source_rate_24h))
    .filter((n) => Number.isFinite(n));
  const trendAlertStatus = historyStatus?.trendAlert?.breach?.active ? "ACTIVE" : "HEALTHY";
  const trendSlope = Number(historyStatus?.trendAlert?.latest?.slopePerHour);

  return (
    <>
      <PageHead title="Ops Console — Sentinel Ledger" description="Internal operations and observability." />
      <div className="min-h-[70vh] w-full max-w-5xl mx-auto px-4 sm:px-5 py-8 sm:py-10">
        <header className="mb-8 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">Internal</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Omni Ops Console</h1>
          <p className="text-sm text-gray-500 max-w-2xl leading-relaxed">
            Authenticate once for Ops APIs. Signed export integrity checks use a separate public endpoint (no ops key,
            rate-limited) so third parties can validate evidence you share.
          </p>
        </header>

        <section className="rounded-2xl border border-white/[0.08] bg-[#080a0d]/90 p-4 sm:p-5 space-y-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3 min-w-0">
            <div className="flex-1 min-w-0 space-y-1.5">
              <label htmlFor="ops-key" className="text-[11px] text-gray-500 font-medium">
                Ops key <span className="text-gray-600">(stored only in this browser)</span>
              </label>
              <input
                id="ops-key"
                type="password"
                autoComplete="off"
                value={opsKey}
                onChange={(e) => setOpsKey(e.target.value)}
                placeholder="OMNI_BOT_OPS_KEY"
                className="w-full h-11 rounded-xl bg-[#0E1318] border border-white/[0.08] px-3 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/40"
              />
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={saveKey}
                className="h-11 px-4 rounded-xl border border-white/[0.1] bg-white/[0.03] text-sm text-gray-200 hover:bg-white/[0.06] transition"
              >
                Save locally
              </button>
              <button
                type="button"
                onClick={loadData}
                disabled={loading || !hasKey}
                className="h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {loading ? "Loading…" : "Refresh data"}
              </button>
            </div>
          </div>

          <div
            className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-thin scrollbar-thumb-white/10"
            role="tablist"
            aria-label="Ops sections"
          >
            {TABS.map((t) => (
              <TabButton key={t.id} id={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </TabButton>
            ))}
          </div>
        </section>

        <div className="mt-6 space-y-6">
          {tab === "overview" && (
            <section
              id="panel-overview"
              role="tabpanel"
              aria-labelledby="tab-overview"
              className="space-y-4"
            >
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi
                  label="Ingestion guard"
                  value={guard ? overviewGuardLabel : "—"}
                  hint={guard ? "Entropy + rate limits" : "Refresh to load"}
                  tone={guard ? overviewGuardTone : "neutral"}
                />
                <Kpi
                  label="Guard drops (total)"
                  value={guard ? formatInteger(guard.metrics?.totalDrops || 0) : "—"}
                  hint="Cumulative since process start"
                  tone="neutral"
                />
                <Kpi
                  label="Signal win rate (48h)"
                  value={perf?.metrics?.winRatePct != null ? `${perf.metrics.winRatePct}%` : "—"}
                  hint={perf ? `${formatInteger(perf.resolvedRows || 0)} resolved` : "Refresh to load"}
                  tone="neutral"
                />
                <Kpi
                  label="Profit factor"
                  value={perf?.metrics?.profitFactor != null ? String(perf.metrics.profitFactor) : "—"}
                  hint="Observed outcomes"
                  tone="neutral"
                />
                <Kpi
                  label="Supabase source (24h)"
                  value={signalsFresh ? formatPctUnit(supabaseRate24h) : "—"}
                  hint={signalsFresh ? `Target ${formatPctUnit(sloTarget)}` : "Refresh to load"}
                  tone={!signalsFresh ? "neutral" : sloMet ? "good" : "warn"}
                />
                <Kpi
                  label="SLO status"
                  value={!signalsFresh ? "—" : sloMet ? "PASS" : "FAIL"}
                  hint={`Requests24h ${formatInteger(signalsFresh?.requests24h || 0)}`}
                  tone={!signalsFresh ? "neutral" : sloMet ? "good" : "bad"}
                />
                <Kpi
                  label="History points (7d)"
                  value={formatInteger(historyRows.length)}
                  hint={`Tick ${formatInteger(historyStatus?.tickIntervalMs || 0)} ms`}
                  tone="neutral"
                />
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-white mb-3">At a glance</h2>
                <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-300">
                  <div className="space-y-2 min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Entropy guard</p>
                    <ul className="space-y-1 text-[13px] leading-relaxed">
                      <li>
                        <span className="text-gray-500">Tracked mints:</span>{" "}
                        {guard ? formatInteger(guard.metrics?.trackedMints || 0) : "—"}
                      </li>
                      <li>
                        <span className="text-gray-500">Memory:</span>{" "}
                        {guard ? formatBytes(guard.metrics?.memoryUsageBytes || 0) : "—"}
                      </li>
                      <li className="text-gray-500 break-words">
                        Flags: sustained {String(sustained)} · memory {String(memAlert)} · pressure{" "}
                        {String(guardPressure)}
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2 min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Signals</p>
                    <ul className="space-y-1 text-[13px] leading-relaxed">
                      <li>
                        <span className="text-gray-500">Pending rows:</span>{" "}
                        {perf ? formatInteger(perf.pendingRows || 0) : "—"}
                      </li>
                      <li>
                        <span className="text-gray-500">Avg outcome:</span>{" "}
                        {perf?.metrics?.avgOutcomePct != null ? `${perf.metrics.avgOutcomePct}%` : "—"}
                      </li>
                      <li>
                        <span className="text-gray-500">Calibrator:</span>{" "}
                        {calib?.lastCalibration?.at ? formatDateTime(calib.lastCalibration.at) : "No run yet"}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-600">
                Use <strong className="text-gray-400">Ingestion</strong> and <strong className="text-gray-400">Signals</strong>{" "}
                tabs for full tables. Support queues live under <strong className="text-gray-400">Operations</strong>.
              </p>
            </section>
          )}

          {tab === "ingestion" && (
            <section
              id="panel-ingestion"
              role="tabpanel"
              aria-labelledby="tab-ingestion"
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Entropy guard</h2>
                <span
                  className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${
                    guardPressure
                      ? "bg-red-500/12 border-red-500/35 text-red-200"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                  }`}
                >
                  {guardPressure ? "Alert: high ingestion pressure" : "Within expected range"}
                </span>
              </div>

              {!guard ? (
                <p className="text-sm text-gray-500">No guard snapshot yet — authenticate and refresh.</p>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Kpi label="Tracked mints" value={formatInteger(guard.metrics?.trackedMints || 0)} />
                    <Kpi label="Total drops" value={formatInteger(guard.metrics?.totalDrops || 0)} />
                    <Kpi label="Estimated memory" value={formatBytes(guard.metrics?.memoryUsageBytes || 0)} />
                    <Kpi
                      label="Window"
                      value={`${formatInteger(guard.config?.windowMs || 0)} ms`}
                    />
                  </div>

                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4 min-w-0">
                      <div className="text-[11px] text-gray-500 font-semibold mb-2">Top offender</div>
                      {guard.topOffenders?.[0] ? (
                        <p className="text-sm text-gray-200 break-all font-mono leading-relaxed">
                          {guard.topOffenders[0].mint}
                          <span className="text-gray-500 font-sans"> · {formatInteger(guard.topOffenders[0].drops)} drops</span>
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">None recorded.</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4 min-w-0">
                      <div className="text-[11px] text-gray-500 font-semibold mb-2">Drop reasons</div>
                      {!guard.metrics?.dropsByReason || !Object.keys(guard.metrics.dropsByReason).length ? (
                        <p className="text-sm text-gray-500">No drops.</p>
                      ) : (
                        <ul className="space-y-2 text-sm text-gray-200">
                          {Object.entries(guard.metrics.dropsByReason)
                            .sort((a, b) => Number(b[1]) - Number(a[1]))
                            .slice(0, 8)
                            .map(([reason, count]) => (
                              <li key={reason} className="flex justify-between gap-3">
                                <span className="text-gray-300 break-all min-w-0">{reason}</span>
                                <span className="tabular-nums text-gray-500 shrink-0">{formatInteger(count)}</span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "signals" && (
            <section
              id="panel-signals"
              role="tabpanel"
              aria-labelledby="tab-signals"
              className="space-y-5"
            >
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5 space-y-5">
                <h2 className="text-lg font-semibold text-white">Signal performance (48h)</h2>
                {!perf ? (
                  <p className="text-sm text-gray-500">No performance bundle loaded.</p>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Kpi label="Win rate" value={`${perf.metrics?.winRatePct ?? 0}%`} />
                      <Kpi label="Profit factor" value={String(perf.metrics?.profitFactor ?? 0)} />
                      <Kpi label="Avg outcome" value={`${perf.metrics?.avgOutcomePct ?? 0}%`} />
                      <Kpi
                        label="Conf ↔ return"
                        value={perf.metrics?.confidenceReturnCorrelation ?? "n/a"}
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Kpi label="Resolved rows" value={formatInteger(perf.resolvedRows ?? 0)} />
                      <Kpi label="Pending rows" value={formatInteger(perf.pendingRows ?? 0)} />
                      <Kpi label="Failed rows" value={formatInteger(perf.failedRows ?? 0)} />
                      <Kpi label="Max drawdown" value={`${perf.metrics?.maxDrawdownPct ?? 0}%`} />
                    </div>
                    {perf.diagnostics ? (
                      <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4 space-y-3">
                        <div className="text-[11px] text-gray-500 font-semibold">Why resolved might look low</div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          <strong className="text-gray-300">Resolved rows</strong> here means resolved with a numeric{" "}
                          <code className="text-gray-500">outcome_pct</code> (used for win rate).{" "}
                          <strong className="text-gray-300">Sampled</strong> is capped at{" "}
                          <code className="text-gray-500">maxRows</code>; if you hit the cap, older rows in the window
                          are omitted.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3 text-sm">
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Status (sample)</p>
                            <ul className="text-gray-300 space-y-0.5 font-mono text-[12px]">
                              <li>pending: {formatInteger(perf.diagnostics.statusBreakdown?.pending ?? 0)}</li>
                              <li>resolved: {formatInteger(perf.diagnostics.statusBreakdown?.resolved ?? 0)}</li>
                              <li>failed: {formatInteger(perf.diagnostics.statusBreakdown?.failed ?? 0)}</li>
                              <li>other: {formatInteger(perf.diagnostics.statusBreakdown?.other ?? 0)}</li>
                            </ul>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Pipeline hints</p>
                            <ul className="text-gray-300 space-y-0.5 font-mono text-[12px]">
                              <li>sample cap hit: {perf.diagnostics.hitSampleLimit ? "yes" : "no"}</li>
                              <li>pending w/o entry price: {formatInteger(perf.diagnostics.pendingMissingEntryPrice ?? 0)}</li>
                              <li>resolved w/o outcome: {formatInteger(perf.diagnostics.resolvedIncompleteOutcome ?? 0)}</li>
                              <li>default horizon (min): {formatInteger(perf.diagnostics.defaultHorizonMin ?? 0)}</li>
                            </ul>
                          </div>
                        </div>
                        {perf.diagnostics.failedReasonTop?.length ? (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-2">
                              Top failure reasons
                            </p>
                            <ul className="space-y-1 text-sm text-gray-200">
                              {perf.diagnostics.failedReasonTop.map((row) => (
                                <li key={row.reason} className="flex justify-between gap-3">
                                  <span className="text-gray-300 break-all min-w-0">{row.reason}</span>
                                  <span className="tabular-nums text-gray-500 shrink-0">{formatInteger(row.count)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                      <div className="text-[11px] text-gray-500 font-semibold mb-3">Top signal combos</div>
                      {!perf.combos?.length ? (
                        <p className="text-sm text-gray-500">No combo data yet.</p>
                      ) : (
                        <div className="divide-y divide-white/[0.06]">
                          {perf.combos.slice(0, 8).map((c) => (
                            <div
                              key={c.combo}
                              className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm text-gray-200"
                            >
                              <span className="font-mono text-[13px] break-all">{c.combo}</span>
                              <span className="text-[12px] text-gray-500 shrink-0">
                                WR {c.winRatePct}% · AVG {c.avgOutcomePct}% · n={c.total}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5 space-y-4">
                <h2 className="text-lg font-semibold text-white">Freshness trend (signalsLatest)</h2>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Kpi
                    label="Supabase rate (24h)"
                    value={signalsFresh ? formatPctUnit(supabaseRate24h) : "—"}
                    hint={signalsFresh ? `Target ${formatPctUnit(sloTarget)}` : "Refresh to load"}
                    tone={!signalsFresh ? "neutral" : sloMet ? "good" : "warn"}
                  />
                  <Kpi
                    label="Top fallback reason"
                    value={topFallback ? topFallback[0] : "none"}
                    hint={topFallback ? `hits ${formatInteger(topFallback[1])}` : "No fallback in window"}
                    tone="neutral"
                  />
                  <Kpi
                    label="Top provider used"
                    value={topProvider ? topProvider[0] : "n/a"}
                    hint={topProvider ? `hits ${formatInteger(topProvider[1])}` : "No provider stats"}
                    tone="neutral"
                  />
                </div>
                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                      Last 24h ({formatInteger(supabaseSeries24h.length)} points)
                    </p>
                    <Sparkline points={supabaseSeries24h} stroke="#22d3ee" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                      Last 7d ({formatInteger(supabaseSeries7d.length)} points)
                    </p>
                    <Sparkline points={supabaseSeries7d} stroke="#a78bfa" />
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  SLO alert engine: {sloSnapshot?.status || "n/a"} · history cron{" "}
                  {historyStatus?.cronEnabled ? "enabled" : "disabled"} · retention{" "}
                  {formatInteger(historyStatus?.retentionDays || 0)}d
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Kpi
                    label="History trend alert"
                    value={historyStatus?.trendAlert ? trendAlertStatus : "—"}
                    hint={historyStatus?.trendAlert?.enabled ? "sustained + slope model" : "disabled"}
                    tone={!historyStatus?.trendAlert ? "neutral" : trendAlertStatus === "ACTIVE" ? "bad" : "good"}
                  />
                  <Kpi
                    label="Trend slope (/h)"
                    value={Number.isFinite(trendSlope) ? trendSlope.toFixed(4) : "—"}
                    hint="Negative means worsening"
                    tone={
                      !Number.isFinite(trendSlope) ? "neutral" : trendSlope < 0 ? "warn" : "good"
                    }
                  />
                  <Kpi
                    label="History alerts sent"
                    value={formatInteger(historyStatus?.trendAlert?.breach?.alertsSent || 0)}
                    hint={historyStatus?.trendAlert?.breach?.lastAlertAt ? "last alert recorded" : "no alerts yet"}
                    tone="neutral"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadHistoryCsv(24)}
                    className="h-9 px-3 rounded-lg border border-white/[0.1] bg-white/[0.03] text-xs text-gray-200 hover:bg-white/[0.06] transition"
                  >
                    Export CSV (24h)
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadHistoryCsv(168)}
                    className="h-9 px-3 rounded-lg border border-white/[0.1] bg-white/[0.03] text-xs text-gray-200 hover:bg-white/[0.06] transition"
                  >
                    Export CSV (7d)
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadHistorySignedJson(24)}
                    className="h-9 px-3 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.08] text-xs text-cyan-100 hover:bg-cyan-500/[0.14] transition"
                  >
                    Export Signed JSON (24h)
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadHistorySignedJson(168)}
                    className="h-9 px-3 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.08] text-xs text-cyan-100 hover:bg-cyan-500/[0.14] transition"
                  >
                    Export Signed JSON (7d)
                  </button>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-3 sm:p-4 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                    Third-party verify (F4.7)
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    POST full signed JSON to{" "}
                    <code className="text-gray-400 break-all">
                      {getPublicApiUrl()}/api/v1/ops/verify-signed-export
                    </code>
                    . No secrets in the body; server returns PASS/FAIL only. Ed25519 exports can also be checked offline
                    using{" "}
                    <code className="text-gray-400 break-all">
                      {getPublicApiUrl()}/api/v1/public/freshness-export-verification-key
                    </code>{" "}
                    (when configured).
                  </p>
                  <textarea
                    value={verifyPaste}
                    onChange={(e) => setVerifyPaste(e.target.value)}
                    rows={4}
                    spellCheck={false}
                    placeholder='Paste entire signed export JSON here (starts with {"ok":true,"type":"ops_data_freshness_history_signed_export"…})'
                    className="w-full min-h-[88px] rounded-lg bg-[#0E1318] border border-white/[0.08] px-2.5 py-2 text-xs text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={verifyPublicSignedExport}
                      disabled={verifyBusy}
                      className="h-9 px-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-40 transition"
                    >
                      {verifyBusy ? "Verifying…" : "Verify integrity (public)"}
                    </button>
                    {verifyResult ? (
                      <span
                        className={`text-[11px] font-semibold tabular-nums ${
                          verifyResult.valid ? "text-emerald-300" : "text-amber-200"
                        }`}
                      >
                        {verifyResult.valid ? "PASS" : "FAIL"} · hash {String(verifyResult.hashMatches)} · proof{" "}
                        {String(verifyResult.proofInputMatches)} · sig {String(verifyResult.signatureMatches)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5 space-y-4">
                <h2 className="text-lg font-semibold text-white">Calibrator (advisory)</h2>
                {!calib?.lastCalibration ? (
                  <p className="text-sm text-gray-500">No calibration snapshot yet.</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">
                      Last run {formatDateTime(calib.lastCalibration.at)} · lookback {calib.lastCalibration.lookbackHours}
                      h
                    </p>
                    <div className="space-y-2">
                      {(calib.lastCalibration.proposals || [])
                        .filter((p) => p.eligible)
                        .slice(0, 12)
                        .map((p) => (
                          <div
                            key={p.signal}
                            className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 px-3 py-2.5 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 min-w-0"
                          >
                            <span className="font-mono text-gray-200 break-all">{p.signal}</span>
                            <span className="text-gray-500 text-[13px] shrink-0">
                              suggested <span className="text-gray-300">{p.suggestedWeight}</span> · Δ{" "}
                              {Math.round(p.deltaPct * 10000) / 100}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {tab === "operations" && (
            <section
              id="panel-operations"
              role="tabpanel"
              aria-labelledby="tab-operations"
              className="space-y-5"
            >
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-white mb-3">Broadcast</h2>
                <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                  <input
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    placeholder="Message to omni channels (Telegram)…"
                    className="flex-1 min-w-0 h-11 rounded-xl bg-[#0E1318] border border-white/[0.08] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                  />
                  <button
                    type="button"
                    onClick={sendBroadcast}
                    className="h-11 px-5 rounded-xl border border-white/[0.1] bg-white/[0.04] text-sm font-medium text-gray-100 hover:bg-white/[0.08] shrink-0"
                  >
                    Send
                  </button>
                </div>
                <p className="text-[11px] text-gray-600 mt-2">Requires a valid ops key and server-side routing to Telegram.</p>
              </div>

              <div className="grid xl:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5 flex flex-col min-h-0">
                  <h2 className="text-lg font-semibold text-white mb-3">Support tickets</h2>
                  {!tickets.length ? (
                    <p className="text-sm text-gray-500">No tickets loaded.</p>
                  ) : (
                    <div className="space-y-2 max-h-[min(420px,55vh)] overflow-y-auto pr-1 overscroll-contain">
                      {tickets.map((t) => (
                        <div key={t.id} className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-3">
                          <div className="flex justify-between gap-3 text-[11px] text-gray-500 mb-1">
                            <span>{t.channel}</span>
                            <span className="shrink-0">{formatDateTime(t.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-200 break-words">{t.user_message}</p>
                          <p className="text-[11px] text-gray-500 mt-1">Intent: {t.intent}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => setTicketStatus(t.id, "open")}
                              className={`px-2.5 py-1 rounded-lg text-xs border ${
                                t.status === "open"
                                  ? "bg-amber-500/12 border-amber-500/35 text-amber-200"
                                  : "border-white/[0.08] text-gray-400 hover:bg-white/[0.04]"
                              }`}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => setTicketStatus(t.id, "resolved")}
                              className={`px-2.5 py-1 rounded-lg text-xs border ${
                                t.status === "resolved"
                                  ? "bg-emerald-500/12 border-emerald-500/35 text-emerald-200"
                                  : "border-white/[0.08] text-gray-400 hover:bg-white/[0.04]"
                              }`}
                            >
                              Resolved
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5 flex flex-col min-h-0">
                  <h2 className="text-lg font-semibold text-white mb-3">Bot events</h2>
                  {!events.length ? (
                    <p className="text-sm text-gray-500">No events loaded.</p>
                  ) : (
                    <div className="space-y-2 max-h-[min(420px,55vh)] overflow-y-auto pr-1 overscroll-contain">
                      {events.map((ev) => (
                        <div key={ev.id} className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-3">
                          <div className="flex justify-between gap-3 text-[11px] text-gray-500 mb-1">
                            <span>{ev.channel}</span>
                            <span className="shrink-0">{formatDateTime(ev.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-200 break-words">{ev.message}</p>
                          <p className="text-[11px] text-gray-500 mt-1">Intent: {ev.intent}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
