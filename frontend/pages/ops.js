import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const MIN_HORIZON_SAMPLE = 5;
const MIN_COORD_ALERT_SCORE = 0.68;

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
  const [savedOpsKey, setSavedOpsKey] = useState("");
  const autoLoadedRef = useRef(false);
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
  const [walletBehaviorStatus, setWalletBehaviorStatus] = useState(null);
  const [walletBehaviorTop, setWalletBehaviorTop] = useState([]);
  const [signalGate, setSignalGate] = useState(null);
  const [signalGateTuner, setSignalGateTuner] = useState(null);
  const [telemetrySummary, setTelemetrySummary] = useState(null);
  const [walletCoordStatus, setWalletCoordStatus] = useState(null);
  const [walletCoordAlerts, setWalletCoordAlerts] = useState([]);
  const [walletCoordOutcomes, setWalletCoordOutcomes] = useState([]);
  const [walletCoordOutcomesDegraded, setWalletCoordOutcomesDegraded] = useState(false);
  const [validationRules, setValidationRules] = useState([]);
  const [validationOracleStatus, setValidationOracleStatus] = useState(null);
  const [autoDiscoveryStatus, setAutoDiscoveryStatus] = useState(null);
  const [autoDiscoveryCandidates, setAutoDiscoveryCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [verifyPaste, setVerifyPaste] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("sentinel-ops-key");
    if (saved) {
      setOpsKey(saved);
      setSavedOpsKey(saved);
    }
  }, []);

  const hasKey = useMemo(() => opsKey.trim().length > 0, [opsKey]);

  const saveKey = () => {
    const trimmed = opsKey.trim();
    localStorage.setItem("sentinel-ops-key", trimmed);
    autoLoadedRef.current = false;
    setSavedOpsKey(trimmed);
    toast.success("Ops key saved locally.");
  };

  const loadData = useCallback(async () => {
    if (!hasKey) return toast.error("Set your ops key first.");
    setLoading(true);
    try {
      const [
        ticketRes,
        eventRes,
        guardRes,
        perfRes,
        calibRes,
        freshRes,
        histRes,
        sloRes,
        histStatusRes,
        walletBehaviorStatusRes,
        walletBehaviorTopRes,
        signalGateRes,
        signalGateTunerRes,
        telemetryRes,
        walletCoordStatusRes,
        walletCoordAlertsRes,
        walletCoordOutcomesRes,
        validationRulesRes,
        autoDiscoveryStatusRes,
        autoDiscoveryCandidatesRes
      ] = await Promise.all([
        withOpsKey("/api/v1/bots/omni/tickets?limit=50", opsKey),
        withOpsKey("/api/v1/bots/omni/events?limit=100", opsKey),
        withOpsKey("/api/v1/ops/entropy-guard/snapshot", opsKey),
        withOpsKey("/api/v1/ops/signal-performance/summary?lookbackHours=48&maxRows=2000", opsKey),
        withOpsKey("/api/v1/ops/signal-performance/calibration", opsKey),
        withOpsKey("/api/v1/ops/data-freshness", opsKey),
        withOpsKey("/api/v1/ops/data-freshness/history?hours=168&endpoint=signalsLatest&limit=1000", opsKey),
        withOpsKey("/api/v1/ops/signals-supabase-slo/snapshot", opsKey),
        withOpsKey("/api/v1/ops/data-freshness/history/status", opsKey),
        withOpsKey("/api/v1/ops/wallet-behavior/status", opsKey),
        withOpsKey("/api/v1/ops/wallet-behavior/top?limit=25&minResolved=5", opsKey),
        withOpsKey("/api/v1/ops/signal-gate/status", opsKey),
        withOpsKey("/api/v1/ops/signal-gate/tuner/status", opsKey),
        withOpsKey("/api/v1/telemetry/client/summary", opsKey),
        withOpsKey("/api/v1/ops/wallet-coordination/status", opsKey),
        withOpsKey("/api/v1/ops/wallet-coordination/alerts?limit=50", opsKey),
        withOpsKey("/api/v1/ops/wallet-coordination/outcomes?limit=40", opsKey),
        withOpsKey("/api/v1/ops/validation-oracle/rules?limit=100", opsKey),
        withOpsKey("/api/v1/ops/auto-discovery/status", opsKey),
        withOpsKey("/api/v1/ops/auto-discovery/candidates?limit=25", opsKey)
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
      setWalletBehaviorStatus(walletBehaviorStatusRes.data || null);
      setWalletBehaviorTop(walletBehaviorTopRes.data || []);
      setSignalGate(signalGateRes.data || null);
      setSignalGateTuner(signalGateTunerRes.data || null);
      setTelemetrySummary(telemetryRes.summary || null);
      setWalletCoordStatus(walletCoordStatusRes.data || null);
      setWalletCoordAlerts(walletCoordAlertsRes.data || []);
      setWalletCoordOutcomes(walletCoordOutcomesRes.data || []);
      setWalletCoordOutcomesDegraded(Boolean(walletCoordOutcomesRes.degraded));
      setValidationRules(validationRulesRes.data || []);
      setValidationOracleStatus(validationRulesRes.status || null);
      setAutoDiscoveryStatus(autoDiscoveryStatusRes.data || null);
      setAutoDiscoveryCandidates(autoDiscoveryCandidatesRes.data || []);
      toast.success("Ops data refreshed.");
    } catch (error) {
      toast.error(`Load failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [hasKey, opsKey]);

  useEffect(() => {
    if (!savedOpsKey || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    loadData();
  }, [loadData, savedOpsKey]);

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

  const runWalletBehaviorNow = async () => {
    if (!hasKey) return toast.error("Set your ops key first.");
    try {
      const runRes = await withOpsKey("/api/v1/ops/wallet-behavior/run", opsKey, { method: "POST" });
      setWalletBehaviorStatus(runRes.data || null);
      const topRes = await withOpsKey("/api/v1/ops/wallet-behavior/top?limit=25&minResolved=5", opsKey);
      setWalletBehaviorTop(topRes.data || []);
      toast.success("Wallet behavior recompute triggered.");
    } catch (error) {
      toast.error(`Wallet behavior run failed: ${error.message}`);
    }
  };

  const runWalletCoordinationNow = async () => {
    if (!hasKey) return toast.error("Set your ops key first.");
    try {
      const runRes = await withOpsKey("/api/v1/ops/wallet-coordination/run", opsKey, { method: "POST" });
      setWalletCoordStatus(runRes.data || null);
      const alertsRes = await withOpsKey("/api/v1/ops/wallet-coordination/alerts?limit=50", opsKey);
      setWalletCoordAlerts(alertsRes.data || []);
      const outRes = await withOpsKey("/api/v1/ops/wallet-coordination/outcomes?limit=40", opsKey);
      setWalletCoordOutcomes(outRes.data || []);
      setWalletCoordOutcomesDegraded(Boolean(outRes.degraded));
      toast.success("Wallet coordination recompute triggered.");
    } catch (error) {
      toast.error(`Wallet coordination run failed: ${error.message}`);
    }
  };

  const runAutoDiscoveryPromotionNow = async () => {
    if (!hasKey) return toast.error("Set your ops key first.");
    try {
      const runRes = await withOpsKey("/api/v1/ops/auto-discovery/promote/run", opsKey, { method: "POST" });
      setAutoDiscoveryStatus(runRes.data?.status || null);
      const candidatesRes = await withOpsKey("/api/v1/ops/auto-discovery/candidates?limit=25", opsKey);
      setAutoDiscoveryCandidates(candidatesRes.data || []);
      toast.success("Auto-discovery promotion tick executed.");
    } catch (error) {
      toast.error(`Auto-discovery promotion failed: ${error.message}`);
    }
  };

  const runSignalGateTunerNow = async () => {
    if (!hasKey) return toast.error("Set your ops key first.");
    try {
      const runRes = await withOpsKey("/api/v1/ops/signal-gate/tuner/run", opsKey, { method: "POST" });
      setSignalGateTuner(runRes.data?.status || null);
      const gateRes = await withOpsKey("/api/v1/ops/signal-gate/status", opsKey);
      setSignalGate(gateRes.data || null);
      toast.success("Signal gate tuner executed.");
    } catch (error) {
      toast.error(`Signal gate tuner failed: ${error.message}`);
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
  const walletBehaviorRows = Array.isArray(walletBehaviorTop) ? walletBehaviorTop : [];
  const lowSampleRows = walletBehaviorRows.filter((row) => {
    return (
      Number(row?.resolved_signals_5m || 0) < MIN_HORIZON_SAMPLE ||
      Number(row?.resolved_signals_30m || 0) < MIN_HORIZON_SAMPLE ||
      Number(row?.resolved_signals_2h || 0) < MIN_HORIZON_SAMPLE
    );
  });
  const coordRows = Array.isArray(walletCoordAlerts) ? walletCoordAlerts : [];
  const outcomeRows = Array.isArray(walletCoordOutcomes) ? walletCoordOutcomes : [];
  const redCoordRows = coordRows.filter((row) => String(row?.severity || "").toUpperCase() === "RED");
  const highScoreCoordRows = redCoordRows.filter((row) => Number(row?.score || 0) >= MIN_COORD_ALERT_SCORE);
  const signalGateBlockedEntries = Object.entries(signalGate?.stats?.blockedByReason || {}).sort(
    (a, b) => Number(b[1] || 0) - Number(a[1] || 0)
  );
  const oracleRows = Array.isArray(validationRules) ? validationRules : [];
  const ttaAvgMs = telemetrySummary?.tta?.avgMs;
  const freshnessCounts = telemetrySummary?.freshness || {};
  const degradedFreshnessCount = Number(freshnessCounts.DEGRADED || 0) + Number(freshnessCounts.STALE || 0);
  const swProfileTe = telemetrySummary?.swProfile;

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
                  label="Wallet behavior updated"
                  value={walletBehaviorStatus?.lastStats?.updated != null ? formatInteger(walletBehaviorStatus.lastStats.updated) : "—"}
                  hint={walletBehaviorStatus?.lastTickFinishedAt ? `last ${formatDateTime(walletBehaviorStatus.lastTickFinishedAt)}` : "Refresh to load"}
                  tone="neutral"
                />
                <Kpi
                  label="Wallet style leader"
                  value={walletBehaviorTop?.[0]?.style_label || "—"}
                  hint={walletBehaviorTop?.[0]?.wallet_address ? `${String(walletBehaviorTop[0].wallet_address).slice(0, 6)}...` : "No rows yet"}
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
                <Kpi
                  label="TTA first action"
                  value={ttaAvgMs != null ? `${formatInteger(ttaAvgMs)} ms` : "—"}
                  hint={telemetrySummary?.tta?.count ? `${formatInteger(telemetrySummary.tta.count)} measured sessions` : "Waiting for users"}
                  tone="neutral"
                />
                <Kpi
                  label="Freshness states"
                  value={telemetrySummary ? `L${formatInteger(freshnessCounts.LIVE || 0)} / S${formatInteger(freshnessCounts.STALE || 0)} / D${formatInteger(freshnessCounts.DEGRADED || 0)}` : "—"}
                  hint="Live / Stale / Degraded observed by clients"
                  tone={!telemetrySummary ? "neutral" : degradedFreshnessCount ? "warn" : "good"}
                />
                <Kpi
                  label="smart_wallets profile rows synced"
                  value={swProfileTe != null ? formatInteger(swProfileTe.totalRowUpdates || 0) : "—"}
                  hint={
                    swProfileTe?.lastAt
                      ? `behavior → early/cluster/consistency · last ${formatDateTime(swProfileTe.lastAt)}`
                      : "From wallet-behavior tick (resolved_signals ≥ 1)"
                  }
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
                    <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-[11px] text-gray-500 font-semibold">Validation Oracle — rule performance</div>
                          <p className="mt-1 text-[11px] text-gray-600">
                            Shadow mode. Audit-only; does not affect signal gating.
                          </p>
                        </div>
                        <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-200">
                          {validationOracleStatus?.cronEnabled ? "oracle live" : "oracle off"}
                        </span>
                      </div>
                      {!oracleRows.length ? (
                        <p className="text-sm text-gray-500">No validation rows yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left text-xs">
                            <thead className="text-[10px] uppercase tracking-wide text-gray-500">
                              <tr className="border-b border-white/[0.06]">
                                <th className="py-2 pr-3">rule_id</th>
                                <th className="py-2 pr-3 text-right">total_signals</th>
                                <th className="py-2 pr-3 text-right">win_rate_60m</th>
                                <th className="py-2 pr-3 text-right">avg_return</th>
                                <th className="py-2 pr-3 text-right">confidence_score</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.05] font-mono text-gray-300">
                              {oracleRows.map((row) => {
                                const total = Number(row.total_signals || 0);
                                const winRate = total > 0 ? (Number(row.success_count_60m || 0) / total) * 100 : 0;
                                const avgReturn = Number(row.avg_return_60m || 0) * 100;
                                const conf = Number(row.confidence_score || 0) * 100;
                                const regimes = row.regime_performance && typeof row.regime_performance === "object" ? row.regime_performance : {};
                                const regimeLine = ["bull", "crab", "volatile"]
                                  .map((key) => {
                                    const r = regimes[key] || {};
                                    const n = Number(r.total || 0);
                                    if (n < 10) return null;
                                    return `${key} ${Math.round(Number(r.confidence || 0) * 100)}%`;
                                  })
                                  .filter(Boolean)
                                  .join(" · ");
                                return (
                                  <tr key={row.rule_id}>
                                    <td className="py-2 pr-3 text-gray-100">
                                      <div>{row.rule_id}</div>
                                      {regimeLine ? <div className="mt-0.5 text-[10px] text-gray-500">{regimeLine}</div> : null}
                                    </td>
                                    <td className="py-2 pr-3 text-right">{formatInteger(total)}</td>
                                    <td className="py-2 pr-3 text-right">{winRate.toFixed(1)}%</td>
                                    <td className={`py-2 pr-3 text-right ${avgReturn >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                                      {avgReturn >= 0 ? "+" : ""}
                                      {avgReturn.toFixed(1)}%
                                    </td>
                                    <td className="py-2 pr-3 text-right">{total >= 10 ? `${conf.toFixed(1)}%` : "n<10"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                      <div className="text-[11px] text-gray-500 font-semibold mb-1">Outcomes by emission regime</div>
                      <p className="text-[11px] text-gray-600 mb-3">
                        Resolved rows only. <span className="text-gray-500">legacy</span> = archived before regime
                        metadata or missing gate meta.
                      </p>
                      {!perf.regimes?.length ? (
                        <p className="text-sm text-gray-500">No regime-stratified resolved rows in this window.</p>
                      ) : (
                        <div className="divide-y divide-white/[0.06]">
                          {perf.regimes.slice(0, 8).map((r) => (
                            <div
                              key={r.regime}
                              className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm text-gray-200"
                            >
                              <span className="font-mono text-[13px] capitalize">{r.regime}</span>
                              <span className="text-[12px] text-gray-500 shrink-0">
                                WR {r.winRatePct}% · PF {r.profitFactor ?? "—"} · DD {r.maxDrawdownPct ?? "—"}% · AVG{" "}
                                {r.avgOutcomePct}% · n={r.total}
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
                <h2 className="text-lg font-semibold text-white">Signal emission gate (Phase A)</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Kpi label="Gate enabled" value={signalGate?.config ? (signalGate.config.enabled ? "yes" : "no") : "—"} />
                  <Kpi
                    label="Decisions"
                    value={signalGate?.stats?.decisions != null ? formatInteger(signalGate.stats.decisions) : "—"}
                  />
                  <Kpi
                    label="Emitted"
                    value={signalGate?.stats?.emitted != null ? formatInteger(signalGate.stats.emitted) : "—"}
                    tone="good"
                  />
                  <Kpi
                    label="Blocked"
                    value={signalGate?.stats?.blocked != null ? formatInteger(signalGate.stats.blocked) : "—"}
                    tone={Number(signalGate?.stats?.blocked || 0) > 0 ? "warn" : "neutral"}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Emit rate:{" "}
                  {signalGate?.stats?.emitRate != null ? `${(Number(signalGate.stats.emitRate) * 100).toFixed(1)}%` : "—"} · last
                  decision {signalGate?.stats?.lastDecisionAt ? formatDateTime(signalGate.stats.lastDecisionAt) : "—"}
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Kpi
                    label="Regime gate"
                    value={signalGate?.regime?.enabled ? "on" : "off"}
                    hint={
                      signalGate?.regime?.classifier
                        ? `volatile ≥${signalGate.regime.classifier.volatileAbsPct}% chg or vol/liq ≥${signalGate.regime.classifier.volatileVolLiqRatio} · trending ≥${signalGate.regime.classifier.trendingAbsPct}%`
                        : "Uses 24h % change + volume/liquidity from existing market snapshot"
                    }
                    tone={signalGate?.regime?.enabled ? "warn" : "neutral"}
                  />
                  <Kpi
                    label="Recent decisions by regime"
                    value={
                      signalGate?.regime?.byRegime
                        ? formatInteger(
                            Object.values(signalGate.regime.byRegime).reduce((a, r) => a + (r?.decisions || 0), 0)
                          )
                        : "—"
                    }
                    hint="Calm / trending / volatile / unknown (liquidity missing)"
                    tone="neutral"
                  />
                </div>
                {signalGate?.alpha ? (
                  <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                    <div className="text-[11px] text-gray-500 font-semibold mb-2">Alpha layer (Fase A.1 / A.2)</div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Gated on calibrated conf: {signalGate.alpha.useCalibratedConfidence ? "yes" : "no"} · min EV (0=off){" "}
                      {signalGate.alpha.minEvProxy != null ? String(signalGate.alpha.minEvProxy) : "—"} · max slip (1=off){" "}
                      {signalGate.alpha.maxSlippageRisk != null ? String(signalGate.alpha.maxSlippageRisk) : "—"} ·
                      block meta skip: {String(signalGate.alpha.blockMetaLabelSkip || false)} · block caution:{" "}
                      {String(signalGate.alpha.blockMetaLabelCaution || false)}. EV/slippage/labels in{" "}
                      <span className="text-gray-500">score.meta.alphaLayer</span> and archived in{" "}
                      <span className="text-gray-500">emission_gate</span>.
                    </p>
                  </div>
                ) : null}
                {signalGate?.regime?.byRegime ? (
                  <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                    <div className="text-[11px] text-gray-500 font-semibold mb-3">Emissions by regime</div>
                    <ul className="space-y-1.5 text-sm text-gray-200">
                      {["calm", "trending", "volatile", "unknown"].map((k) => {
                        const r = signalGate.regime.byRegime[k] || {};
                        return (
                          <li key={k} className="flex flex-wrap justify-between gap-2">
                            <span className="text-gray-300 capitalize">{k}</span>
                            <span className="tabular-nums text-gray-500 text-xs">
                              d={formatInteger(r.decisions || 0)} · ok={formatInteger(r.emitted || 0)} · block=
                              {formatInteger(r.blocked || 0)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                  <div className="text-[11px] text-gray-500 font-semibold mb-3">Blocked reasons</div>
                  {!signalGateBlockedEntries.length ? (
                    <p className="text-sm text-gray-500">No blocked reasons recorded yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-gray-200">
                      {signalGateBlockedEntries.slice(0, 8).map(([reason, count]) => (
                        <li key={reason} className="flex justify-between gap-3">
                          <span className="text-gray-300 break-all min-w-0">{reason}</span>
                          <span className="tabular-nums text-gray-500 shrink-0">{formatInteger(count)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-gray-500 font-semibold">Adaptive tuner (no extra cost)</div>
                    <button
                      type="button"
                      onClick={runSignalGateTunerNow}
                      className="h-8 px-3 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.08] text-xs text-cyan-100 hover:bg-cyan-500/[0.14] transition"
                    >
                      Run tuner now
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Adaptive enabled:{" "}
                    {signalGateTuner?.tuner?.adaptiveEnabled == null
                      ? "—"
                      : signalGateTuner.tuner.adaptiveEnabled
                        ? "yes"
                        : "no"}{" "}
                    · last run{" "}
                    {signalGateTuner?.tuner?.lastRunAt ? formatDateTime(signalGateTuner.tuner.lastRunAt) : "—"}
                  </p>
                  <p className="text-xs text-gray-500">
                    Lookback {formatInteger(signalGateTuner?.tuner?.lookbackHours || 0)}h · min resolved{" "}
                    {formatInteger(signalGateTuner?.tuner?.minResolvedRows || 0)}
                    {" · "}
                    regime-aware:{" "}
                    {signalGateTuner?.tuner?.regimeAware == null
                      ? "—"
                      : signalGateTuner.tuner.regimeAware
                        ? "on"
                        : "off"}{" "}
                    (min n/regime {formatInteger(signalGateTuner?.tuner?.minPerRegime || 0)})
                  </p>
                  {signalGateTuner?.tuner?.lastSuggestion?.regimeTuning?.worstQualified ? (
                    <p className="text-xs text-gray-500 break-all">
                      Worst bucket (tuner):{" "}
                      <span className="text-gray-300">
                        {String(signalGateTuner.tuner.lastSuggestion.regimeTuning.worstQualified.regime || "—")}
                      </span>
                      {" · "}
                      branch:{" "}
                      {signalGateTuner?.tuner?.lastSuggestion?.suggestion?.evidence?.regimeBranch || "—"}
                    </p>
                  ) : signalGateTuner?.tuner?.lastSuggestion?.regimeTuning?.skipReason ? (
                    <p className="text-xs text-gray-600">
                      Regime branch skipped: {signalGateTuner.tuner.lastSuggestion.regimeTuning.skipReason}
                    </p>
                  ) : null}
                  <p className="text-xs text-gray-400 break-all">
                    Last reason: {signalGateTuner?.tuner?.lastSuggestion?.reason || signalGateTuner?.tuner?.lastError || "—"}
                  </p>
                  {signalGateTuner?.tuner?.lastApplied?.regimeBranch ? (
                    <p className="text-xs text-gray-600">
                      Last applied branch: {signalGateTuner.tuner.lastApplied.regimeBranch}
                    </p>
                  ) : null}
                </div>
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

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white">Wallet behavior memory (F5)</h2>
                  <button
                    type="button"
                    onClick={runWalletBehaviorNow}
                    className="h-9 px-3 rounded-lg border border-violet-500/30 bg-violet-500/[0.08] text-xs text-violet-100 hover:bg-violet-500/[0.14] transition"
                  >
                    Run now
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Kpi label="Cron enabled" value={walletBehaviorStatus ? (walletBehaviorStatus.cronEnabled ? "yes" : "no") : "—"} />
                  <Kpi
                    label="Updated (last run)"
                    value={walletBehaviorStatus?.lastStats?.updated != null ? formatInteger(walletBehaviorStatus.lastStats.updated) : "—"}
                  />
                  <Kpi
                    label="Failed (last run)"
                    value={walletBehaviorStatus?.lastStats?.failed != null ? formatInteger(walletBehaviorStatus.lastStats.failed) : "—"}
                    tone={walletBehaviorStatus?.lastStats?.failed > 0 ? "warn" : "neutral"}
                  />
                  <Kpi
                    label="Token features written"
                    value={
                      walletBehaviorStatus?.lastStats?.tokenFeaturesWritten != null
                        ? formatInteger(walletBehaviorStatus.lastStats.tokenFeaturesWritten)
                        : "—"
                    }
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Last tick: {walletBehaviorStatus?.lastTickFinishedAt ? formatDateTime(walletBehaviorStatus.lastTickFinishedAt) : "—"} ·
                  interval {formatInteger(walletBehaviorStatus?.tickIntervalMs || 0)} ms · lookback{" "}
                  {formatInteger(walletBehaviorStatus?.lookbackDays || 0)}d
                </p>
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    lowSampleRows.length > 0
                      ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                  }`}
                >
                  {lowSampleRows.length > 0
                    ? `Low horizon sample alert: ${formatInteger(lowSampleRows.length)} wallet(s) in top list have n<${MIN_HORIZON_SAMPLE} on 5m/30m/2h.`
                    : `Horizon sample healthy: all top wallets meet n>=${MIN_HORIZON_SAMPLE} on 5m/30m/2h.`}
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                  <div className="text-[11px] text-gray-500 font-semibold mb-3">Top wallets by real win rate</div>
                  {!walletBehaviorTop.length ? (
                    <p className="text-sm text-gray-500">No wallet behavior rows loaded.</p>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {walletBehaviorTop.slice(0, 20).map((row) => (
                        <div
                          key={row.wallet_address}
                          className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-gray-200"
                        >
                          <p className="font-mono break-all text-cyan-200">{row.wallet_address}</p>
                          <p className="text-gray-400 mt-0.5">
                            WR {Number(row.win_rate_real || 0).toFixed(1)}% · resolved {formatInteger(row.resolved_signals || 0)} · style{" "}
                            {row.style_label || "—"}
                          </p>
                          <p className="text-gray-500 mt-0.5">
                            5m/30m/2h WR {Number(row.win_rate_real_5m || 0).toFixed(1)}% /{" "}
                            {Number(row.win_rate_real_30m || 0).toFixed(1)}% / {Number(row.win_rate_real_2h || 0).toFixed(1)}%
                            {" · "}n {formatInteger(row.resolved_signals_5m || 0)}/{formatInteger(row.resolved_signals_30m || 0)}/
                            {formatInteger(row.resolved_signals_2h || 0)}
                          </p>
                          {(Number(row?.resolved_signals_5m || 0) < MIN_HORIZON_SAMPLE ||
                            Number(row?.resolved_signals_30m || 0) < MIN_HORIZON_SAMPLE ||
                            Number(row?.resolved_signals_2h || 0) < MIN_HORIZON_SAMPLE) ? (
                            <span className="inline-flex mt-1 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-200">
                              Low sample
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
              <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.03] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Auto-Discovery</h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Validation Oracle winners → candidate wallets → 6h promotion loop.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={runAutoDiscoveryPromotionNow}
                    className="h-9 px-3 rounded-lg border border-violet-500/30 bg-violet-500/[0.1] text-xs text-violet-100 hover:bg-violet-500/[0.16] transition"
                  >
                    Run promotion now
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Kpi label="Discovery enabled" value={autoDiscoveryStatus ? (autoDiscoveryStatus.enabled ? "yes" : "no") : "—"} />
                  <Kpi
                    label="Promotion enabled"
                    value={autoDiscoveryStatus ? (autoDiscoveryStatus.promotionEnabled ? "yes" : "no") : "—"}
                  />
                  <Kpi
                    label="Last candidates"
                    value={
                      autoDiscoveryStatus?.lastDiscoveryStats?.candidates != null
                        ? formatInteger(autoDiscoveryStatus.lastDiscoveryStats.candidates)
                        : "—"
                    }
                    hint={autoDiscoveryStatus?.lastDiscoveryStats?.mint || "from latest winning signal"}
                  />
                  <Kpi
                    label="Promoted last run"
                    value={
                      autoDiscoveryStatus?.lastPromotionStats?.promoted != null
                        ? formatInteger(autoDiscoveryStatus.lastPromotionStats.promoted)
                        : "—"
                    }
                    tone={Number(autoDiscoveryStatus?.lastPromotionStats?.promoted || 0) > 0 ? "good" : "neutral"}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Last discovery: {autoDiscoveryStatus?.lastDiscoveryAt ? formatDateTime(autoDiscoveryStatus.lastDiscoveryAt) : "—"} ·
                  last promotion:{" "}
                  {autoDiscoveryStatus?.lastPromotionFinishedAt ? formatDateTime(autoDiscoveryStatus.lastPromotionFinishedAt) : "—"} ·
                  interval {formatInteger(autoDiscoveryStatus?.promotionTickMs || 0)} ms · min score{" "}
                  {Number(autoDiscoveryStatus?.promotionMinScore || 0).toFixed(2)}
                </p>
                {autoDiscoveryStatus?.lastPromotionStats?.error ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    Last promotion error: {autoDiscoveryStatus.lastPromotionStats.error}
                  </p>
                ) : null}
                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                  <div className="text-[11px] text-gray-500 font-semibold mb-3">Top candidates</div>
                  {!autoDiscoveryCandidates.length ? (
                    <p className="text-sm text-gray-500">No auto-discovery candidates loaded yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                      {autoDiscoveryCandidates.map((row) => (
                        <div
                          key={row.id || row.wallet_address}
                          className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-gray-200"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex px-1.5 py-0.5 rounded border border-violet-500/35 bg-violet-500/10 text-[10px] font-semibold text-violet-200">
                              {row.status || "candidate"}
                            </span>
                            <span className="text-gray-400">score {Number(row.candidate_score || 0).toFixed(3)}</span>
                            <span className="text-gray-500">closed {formatInteger(row.closed_trades || 0)}</span>
                          </div>
                          <p className="font-mono break-all text-cyan-200 mt-1">{row.wallet_address}</p>
                          <p className="text-gray-500 mt-0.5 break-all">
                            mint {row.discovered_from_mint || "—"} · rule {row.discovery_rule_id || "—"} · outcome{" "}
                            {row.discovery_outcome_pct != null ? `${(Number(row.discovery_outcome_pct) * 100).toFixed(1)}%` : "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white">Coordination red alerts (F6)</h2>
                  <button
                    type="button"
                    onClick={runWalletCoordinationNow}
                    className="h-9 px-3 rounded-lg border border-red-500/35 bg-red-500/[0.12] text-xs text-red-100 hover:bg-red-500/[0.2] transition"
                  >
                    Rebuild now
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Kpi
                    label="Coord cron enabled"
                    value={walletCoordStatus ? (walletCoordStatus.cronEnabled ? "yes" : "no") : "—"}
                  />
                  <Kpi
                    label="Pairs updated (last run)"
                    value={walletCoordStatus?.lastStats?.updatedPairs != null ? formatInteger(walletCoordStatus.lastStats.updatedPairs) : "—"}
                  />
                  <Kpi
                    label="RED alerts (loaded)"
                    value={formatInteger(redCoordRows.length)}
                    tone={redCoordRows.length > 0 ? "warn" : "good"}
                  />
                  <Kpi
                    label="High-score alerts"
                    value={formatInteger(highScoreCoordRows.length)}
                    hint={`score >= ${MIN_COORD_ALERT_SCORE}`}
                    tone={highScoreCoordRows.length > 0 ? "bad" : "good"}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Last tick: {walletCoordStatus?.lastTickFinishedAt ? formatDateTime(walletCoordStatus.lastTickFinishedAt) : "—"} ·
                  interval {formatInteger(walletCoordStatus?.tickIntervalMs || 0)} ms · lookback{" "}
                  {formatInteger(walletCoordStatus?.lookbackDays || 0)}d
                </p>
                <div className="rounded-xl border border-white/[0.08] bg-[#0b0f13]/80 p-4">
                  <div className="text-[11px] text-gray-500 font-semibold mb-3">Recent coordination alerts</div>
                  {!coordRows.length ? (
                    <p className="text-sm text-gray-500">No coordination alerts loaded.</p>
                  ) : (
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {coordRows.map((row) => (
                        <div
                          key={row.id || `${row.mint}-${row.detected_at}-${row.cluster_key}`}
                          className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-gray-200"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                                String(row.severity || "").toUpperCase() === "RED"
                                  ? "border-red-500/40 bg-red-500/15 text-red-200"
                                  : "border-amber-500/35 bg-amber-500/12 text-amber-200"
                              }`}
                            >
                              {String(row.severity || "N/A").toUpperCase()}
                            </span>
                            <span className="text-gray-400">score {Number(row.score || 0).toFixed(3)}</span>
                            <span className="text-gray-500">{row.detected_at ? formatDateTime(row.detected_at) : "—"}</span>
                          </div>
                          <p className="font-mono break-all text-cyan-200 mt-1">{row.mint || "—"}</p>
                          <p className="text-gray-400 mt-0.5">
                            wallets {formatInteger(row.wallet_count || 0)} · spread {formatInteger(row.spread_sec || 0)}s · latency{" "}
                            {row.latency_from_deploy_min != null ? `${Number(row.latency_from_deploy_min).toFixed(1)}m` : "—"}
                          </p>
                          <p className="text-gray-500 mt-0.5 break-all">{row.reason || "—"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-cyan-500/15 bg-[#0b0f13]/80 p-4 mt-4">
                  <div className="text-[11px] text-gray-500 font-semibold mb-1">T+N market outcomes (coordination_outcomes)</div>
                  {walletCoordOutcomesDegraded ? (
                    <p className="text-xs text-amber-300/90 mb-2">Degraded: table missing or not migrated — apply `012`–`014` / `npm run db:ensure-signal-performance --prefix backend`, luego `npm run db:verify-schema --prefix backend` y Security Advisor.</p>
                  ) : null}
                  {!outcomeRows.length ? (
                    <p className="text-sm text-gray-500">No outcome rows yet (or all pending before first resolve tick).</p>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 text-xs">
                      {outcomeRows.map((o) => (
                        <div
                          key={o.id || o.alert_id}
                          className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-gray-200"
                        >
                          <div className="flex flex-wrap gap-2 items-center">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                                o.status === "resolved"
                                  ? o.success
                                    ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-200"
                                    : "border-amber-500/35 text-amber-200"
                                  : o.status === "failed"
                                    ? "border-red-500/40 text-red-200"
                                    : "border-cyan-500/30 text-cyan-200"
                              }`}
                            >
                              {String(o.status || "—")}
                            </span>
                            <span className="text-gray-400">T+N {o.horizon_min != null ? `${o.horizon_min}m` : "—"}</span>
                            {o.outcome_pct != null && Number.isFinite(Number(o.outcome_pct)) ? (
                              <span className="text-emerald-200/90">Δ {Number(o.outcome_pct).toFixed(2)}%</span>
                            ) : null}
                            <span className="text-gray-500">
                              {o.resolved_at ? formatDateTime(o.resolved_at) : o.resolve_after ? `due ${formatDateTime(o.resolve_after)}` : "—"}
                            </span>
                          </div>
                          <p className="font-mono break-all text-cyan-200/90 mt-1 text-[11px]">{o.mint || "—"}</p>
                          {o.failure_reason ? <p className="text-red-300/80 mt-0.5">fail: {o.failure_reason}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

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
