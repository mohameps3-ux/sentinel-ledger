#!/usr/bin/env node
/**
 * Sentinel daily ops snapshot (2-minute report).
 *
 * Usage:
 *   npm run ops:daily
 *
 * Optional env:
 *   BACKEND_URL=http://localhost:3000
 *   OMNI_BOT_OPS_KEY=...
 *
 * Notes:
 * - This script is read-only.
 * - It never mutates state.
 */
require("dotenv").config();

const BACKEND_URL = String(process.env.BACKEND_URL || "http://localhost:3000").replace(/\/+$/, "");
const OPS_KEY = String(
  process.env.OMNI_BOT_OPS_KEY || process.env.OPS_KEY || process.env.SENTINEL_OPS_KEY || ""
).trim();

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "n/a";
  return x.toFixed(digits);
}

async function getJson(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.withOpsKey) {
    if (!OPS_KEY) {
      throw new Error("ops key missing (set OMNI_BOT_OPS_KEY or OPS_KEY or SENTINEL_OPS_KEY)");
    }
    headers["x-ops-key"] = OPS_KEY;
  }
  const res = await fetch(`${BACKEND_URL}${path}`, { method: "GET", headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${body?.error || "request_failed"}`);
  return body;
}

function pickTopProposal(calibData) {
  const list = Array.isArray(calibData?.lastCalibration?.proposals)
    ? calibData.lastCalibration.proposals
    : [];
  return list.find((x) => x && x.eligible) || list[0] || null;
}

function deriveStatus({ healthOk, highPressure, marketDataState, profitFactor, winRatePct }) {
  if (!healthOk) return "RED";
  if (highPressure) return "RED";
  if (String(marketDataState || "").toLowerCase() === "degraded") return "AMBER";
  if (Number.isFinite(profitFactor) && Number.isFinite(winRatePct)) {
    if (profitFactor >= 1.2 && winRatePct >= 55) return "GREEN";
    return "AMBER";
  }
  return "AMBER";
}

function printLine(line = "") {
  process.stdout.write(`${line}\n`);
}

async function main() {
  try {
    const [health, sync, guard, perf, calib] = await Promise.all([
      getJson("/health"),
      getJson("/health/sync"),
      getJson("/api/v1/ops/entropy-guard/snapshot", { withOpsKey: true }),
      getJson("/api/v1/ops/signal-performance/summary?lookbackHours=48&maxRows=2000", {
        withOpsKey: true
      }),
      getJson("/api/v1/ops/signal-performance/calibration", { withOpsKey: true })
    ]);

    const healthOk = Boolean(health?.ok);
    const marketDataState = String(sync?.services?.market_data || "unknown");
    const highPressure = Boolean(guard?.alerts?.highIngestionPressure);
    const totalDrops = safeNum(guard?.metrics?.totalDrops, 0);
    const topOffender = guard?.topOffenders?.[0]?.mint || "none";

    const perfData = perf?.data || {};
    const metrics = perfData?.metrics || {};
    const resolvedRows = safeNum(perfData?.resolvedRows, 0);
    const pendingRows = safeNum(perfData?.pendingRows, 0);
    const profitFactor = Number(metrics?.profitFactor);
    const winRatePct = Number(metrics?.winRatePct);
    const corr = metrics?.confidenceReturnCorrelation;

    const calibData = calib?.data || {};
    const topProposal = pickTopProposal(calibData);

    const status = deriveStatus({
      healthOk,
      highPressure,
      marketDataState,
      profitFactor,
      winRatePct
    });

    printLine(`[Sentinel Daily Ops - ${nowIsoDate()}]`);
    printLine("");
    printLine("Health:");
    printLine(`- /health: ok=${String(healthOk)}`);
    printLine(`- /health/sync market_data: ${marketDataState}`);
    printLine("");
    printLine("Guard:");
    printLine(`- highIngestionPressure: ${String(highPressure)}`);
    printLine(`- totalDrops: ${totalDrops}`);
    printLine(`- topOffender: ${topOffender}`);
    printLine("");
    printLine("Quant:");
    printLine(`- resolvedRows: ${resolvedRows}`);
    printLine(`- pendingRows: ${pendingRows}`);
    printLine(`- profitFactor: ${fmt(profitFactor, 4)}`);
    printLine(`- winRatePct: ${fmt(winRatePct, 2)}`);
    printLine(`- confidenceReturnCorrelation: ${corr == null ? "n/a" : corr}`);
    printLine("");
    printLine("Calibrator:");
    printLine(
      `- last run: ${calibData?.lastCalibration?.at ? new Date(calibData.lastCalibration.at).toISOString() : "n/a"}`
    );
    printLine(
      `- top proposal: ${
        topProposal ? `${topProposal.signal}:${topProposal.suggestedWeight} (eligible=${String(topProposal.eligible)})` : "n/a"
      }`
    );
    printLine("");
    printLine("Decision:");
    printLine(`- Status: ${status}`);
    printLine(
      `- Action today: ${
        status === "GREEN"
          ? "none"
          : status === "AMBER"
            ? "investigate outcomes/market-data drift"
            : "investigate ingestion pressure immediately"
      }`
    );
  } catch (e) {
    printLine(`[Sentinel Daily Ops - ${nowIsoDate()}]`);
    printLine("");
    printLine("Decision:");
    printLine("- Status: RED");
    printLine(`- Action today: daily report failed -> ${e?.message || e}`);
    process.exit(1);
  }
}

main();

