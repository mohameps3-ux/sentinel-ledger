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
  const [loading, setLoading] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");

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
      const [ticketRes, eventRes, guardRes, perfRes, calibRes] = await Promise.all([
        withOpsKey("/api/v1/bots/omni/tickets?limit=50", opsKey),
        withOpsKey("/api/v1/bots/omni/events?limit=100", opsKey),
        withOpsKey("/api/v1/ops/entropy-guard/snapshot", opsKey),
        withOpsKey("/api/v1/ops/signal-performance/summary?lookbackHours=48&maxRows=2000", opsKey),
        withOpsKey("/api/v1/ops/signal-performance/calibration", opsKey)
      ]);
      setTickets(ticketRes.data || []);
      setEvents(eventRes.data || []);
      setGuard(guardRes || null);
      setPerf(perfRes.data || null);
      setCalib(calibRes.data || null);
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

  const guardPressure = Boolean(guard?.alerts?.highIngestionPressure);
  const sustained = Boolean(guard?.alerts?.sustainedDrops);
  const memAlert = Boolean(guard?.alerts?.memoryPressure);

  const overviewGuardTone = guardPressure ? "bad" : sustained || memAlert ? "warn" : "good";
  const overviewGuardLabel = guardPressure
    ? "High pressure"
    : sustained || memAlert
      ? "Watch"
      : "Healthy";

  return (
    <>
      <PageHead title="Ops Console — Sentinel Ledger" description="Internal operations and observability." />
      <div className="min-h-[70vh] w-full max-w-5xl mx-auto px-4 sm:px-5 py-8 sm:py-10">
        <header className="mb-8 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">Internal</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Omni Ops Console</h1>
          <p className="text-sm text-gray-500 max-w-2xl leading-relaxed">
            Authenticate once, then use tabs to focus: overview snapshot, ingestion guard, signal intelligence, or
            support tools. Nothing leaves this browser except signed API calls you trigger.
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
                    <div className="grid sm:grid-cols-3 gap-3">
                      <Kpi label="Resolved rows" value={formatInteger(perf.resolvedRows ?? 0)} />
                      <Kpi label="Pending rows" value={formatInteger(perf.pendingRows ?? 0)} />
                      <Kpi label="Max drawdown" value={`${perf.metrics?.maxDrawdownPct ?? 0}%`} />
                    </div>
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
