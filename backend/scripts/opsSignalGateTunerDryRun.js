"use strict";

/**
 * Default: GET /signal-gate/tuner/preview (read-only, no override writes).
 * Optional: POST /signal-gate/tuner/run when OPS_TUNER_DRY_USE_POST=1 or --post
 * (real run — applies if SIGNAL_GATE_ADAPTIVE_ENABLED=true on the server).
 *
 * Env: OMNI_BOT_OPS_KEY, then URL precedence: OPS_DRY_RUN_BACKEND_URL →
 * RAILWAY_PUBLIC_DOMAIN / RAILWAY_STATIC_URL → BACKEND_URL.
 *
 * Run: node scripts/opsSignalGateTunerDryRun.js
 * Railway: railway run npm run ops:signal-gate-tuner-dry-run
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
const usePost =
  String(process.env.OPS_TUNER_DRY_USE_POST || "").trim() === "1" ||
  String(process.env.OPS_TUNER_DRY_USE_POST || "")
    .trim()
    .toLowerCase() === "true" ||
  process.argv.includes("--post");

if (!BASE || !OPS_KEY) {
  console.error(
    "Missing OMNI_BOT_OPS_KEY and/or API base URL. Set BACKEND_URL in backend/.env, or run: railway run npm run ops:signal-gate-tuner-dry-run"
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
    wouldApply: run.wouldApply,
    reason: run.reason,
    readOnly: run.readOnly,
    previewAt: run.previewAt,
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
  if (usePost) {
    console.log("Mode: status + preview + POST /tuner/run (overrides may apply if adaptive is on).");
  } else {
    console.log("Mode: read-only (GET /tuner/preview + status). Set OPS_TUNER_DRY_USE_POST=1 or --post to POST /tuner/run.\n");
  }

  const sRes = await fetch(`${BASE}/api/v1/ops/signal-gate/tuner/status`, { headers });
  const sBody = await sRes.json().catch(() => ({}));
  if (!sRes.ok || !sBody.ok) {
    console.error("GET tuner/status failed", sRes.status, sBody);
    process.exit(1);
  }
  const t = sBody.data?.tuner || {};
  console.log("\n--- status ---\n");
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

  const pRes = await fetch(`${BASE}/api/v1/ops/signal-gate/tuner/preview`, { headers });
  const pBody = await pRes.json().catch(() => ({}));
  if (!pRes.ok || !pBody.ok) {
    console.error("GET tuner/preview failed", pRes.status, pBody);
    process.exit(1);
  }
  const prev = pBody.data;
  console.log("\n--- preview (read-only) ---\n");
  console.log(JSON.stringify(summarizeRun(prev), null, 2));

  if (!usePost) {
    if (prev?.wouldApply === true) {
      console.log(
        "\nNote: wouldApply=true with adaptive on — a POST /tuner/run would write overrides. This script did not POST."
      );
    }
    return;
  }

  const rRes = await fetch(`${BASE}/api/v1/ops/signal-gate/tuner/run`, { method: "POST", headers });
  const rBody = await rRes.json().catch(() => ({}));
  if (!rRes.ok || !rBody.ok) {
    console.error("POST tuner/run failed", rRes.status, rBody);
    process.exit(1);
  }

  const run = rBody.data?.run;
  const tunerAfter = rBody.data?.status?.tuner;

  console.log("\n--- run (POST) ---\n");
  console.log(JSON.stringify(summarizeRun(run), null, 2));

  console.log("\n--- status after run ---\n");
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
      "\nWARN: NOT a no-op — gate overrides WERE applied. Use default script mode (no POST) for safe checks."
    );
  } else if (run?.adaptiveEnabled === true) {
    console.log(
      "\nAdaptive is enabled; this run did not apply (see reason). A future run could apply if metrics match."
    );
  } else if (run?.applied === false) {
    console.log("\nNo gate overrides applied (adaptive off or run skipped).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
