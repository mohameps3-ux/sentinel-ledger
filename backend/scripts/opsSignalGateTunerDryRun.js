"use strict";

/**
 * GET tuner/status, then POST tuner/run (the real run — not a server-side dry-run API).
 * Gate overrides are applied on the server whenever SIGNAL_GATE_ADAPTIVE_ENABLED=true
 * and the tuner would apply. Keep adaptive disabled to only refresh in-process state
 * and log suggestion without persisting threshold changes.
 *
 * Env (backend/.env):
 *   OMNI_BOT_OPS_KEY=...
 *   BACKEND_URL=https://your-backend.up.railway.app  (optional if using Railway CLI below)
 *
 * Optional override (wins over everything): OPS_DRY_RUN_BACKEND_URL=https://...
 *
 * Run: node scripts/opsSignalGateTunerDryRun.js
 * Run against linked Railway service (injects URL + secrets): railway run npm run ops:signal-gate-tuner-dry-run
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fromRailwayDomain = () => {
  const d = String(process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL || "").trim();
  if (!d) return "";
  return d.startsWith("http") ? d.replace(/\/+$/, "") : `https://${d}`.replace(/\/+$/, "");
};

const BASE = String(
  process.env.OPS_DRY_RUN_BACKEND_URL || fromRailwayDomain() || process.env.BACKEND_URL || ""
).replace(/\/+$/, "");
const OPS_KEY = String(process.env.OMNI_BOT_OPS_KEY || "").trim();

if (!BASE || !OPS_KEY) {
  console.error(
    "Missing OMNI_BOT_OPS_KEY and/or API base URL. Set BACKEND_URL in backend/.env, or run with Railway CLI: railway run npm run ops:signal-gate-tuner-dry-run"
  );
  process.exit(1);
}

const headers = { "x-ops-key": OPS_KEY, "Content-Type": "application/json" };

function summarizeRun(run) {
  if (!run || typeof run !== "object") return run;
  const ev = run.suggestion?.evidence || {};
  return {
    ok: run.ok,
    applied: run.applied,
    reason: run.reason,
    adaptiveEnabled: run.adaptiveEnabled,
    regimeAware: run.regimeAware,
    resolvedRows: run.resolvedRows,
    minResolvedRows: run.minResolvedRows,
    minPerRegime: run.minPerRegime,
    suggestionMode: run.suggestion?.mode,
    regimeBranch: ev.regimeBranch,
    regimeTuning: run.regimeTuning,
    worstQualifiedRegime: run.regimeTuning?.worstQualified?.regime
  };
}

async function main() {
  console.log(`Target: ${BASE}`);

  const sRes = await fetch(`${BASE}/api/v1/ops/signal-gate/tuner/status`, { headers });
  const sBody = await sRes.json().catch(() => ({}));
  if (!sRes.ok || !sBody.ok) {
    console.error("GET tuner/status failed", sRes.status, sBody);
    process.exit(1);
  }
  const t = sBody.data?.tuner || {};
  console.log("\n--- status (before) ---\n");
  console.log(
    JSON.stringify(
      {
        adaptiveEnabled: t.adaptiveEnabled,
        regimeAware: t.regimeAware,
        minPerRegime: t.minPerRegime,
        minResolvedRows: t.minResolvedRows,
        lastRunAt: t.lastRunAt,
        lastApplied: t.lastApplied,
        lastError: t.lastError
      },
      null,
      2
    )
  );

  const rRes = await fetch(`${BASE}/api/v1/ops/signal-gate/tuner/run`, { method: "POST", headers });
  const rBody = await rRes.json().catch(() => ({}));
  if (!rRes.ok || !rBody.ok) {
    console.error("POST tuner/run failed", rRes.status, rBody);
    process.exit(1);
  }

  const run = rBody.data?.run;
  const tunerAfter = rBody.data?.status?.tuner;

  console.log("\n--- run ---\n");
  console.log(JSON.stringify(summarizeRun(run), null, 2));

  console.log("\n--- status embedded after run ---\n");
  console.log(
    JSON.stringify(
      {
        lastRunAt: tunerAfter?.lastRunAt,
        lastApplied: tunerAfter?.lastApplied,
        lastError: tunerAfter?.lastError,
        lastSuggestionSummary: summarizeRun(tunerAfter?.lastSuggestion)
      },
      null,
      2
    )
  );

  if (run?.applied === true) {
    console.warn(
      "\nWARN: NOT a no-op — gate overrides WERE applied on the server. " +
        "You POSTed the real /tuner/run. Only use against prod with " +
        "SIGNAL_GATE_ADAPTIVE_ENABLED=false, or when you intend to change thresholds."
    );
  } else if (run?.adaptiveEnabled === true) {
    console.log(
      "\nAdaptive is enabled; this run did not apply (see reason). A future run could apply if metrics/trigger match."
    );
  } else if (run?.applied === false) {
    console.log("\nNo gate overrides applied (adaptive off or run skipped — see reason).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
