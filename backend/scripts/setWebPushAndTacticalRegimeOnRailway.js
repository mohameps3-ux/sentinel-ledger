/**
 * One-shot: generate VAPID, set Web Push + tactical-regime cron env on the linked Railway service, redeploy.
 * Run from backend/: `node scripts/setWebPushAndTacticalRegimeOnRailway.js`
 * Requires: railway CLI, logged in, project linked. Do not commit output to git.
 */
/* eslint-disable no-console */
"use strict";

const { spawnSync } = require("child_process");
const { generateVAPIDKeys } = require("web-push");

const SUBJECT =
  process.env.WEB_PUSH_VAPID_SUBJECT || "https://sentinel-ledger-ochre.vercel.app";

const RAILWAY_CMD = process.platform === "win32" ? "railway.cmd" : "railway";

function railway(args) {
  const r = spawnSync(RAILWAY_CMD, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: true
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.error || "").toString();
    throw new Error(err || "railway failed");
  }
  return (r.stdout || "").trim();
}

function main() {
  const { publicKey, privateKey } = generateVAPIDKeys();
  if (!publicKey || !privateKey) {
    throw new Error("generateVAPIDKeys returned empty keys");
  }

  const kvs = [
    `WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}`,
    `WEB_PUSH_VAPID_PRIVATE_KEY=${privateKey}`,
    `WEB_PUSH_VAPID_SUBJECT=${SUBJECT}`,
    "TACTICAL_REGIME_CRON_ENABLED=true",
    "TACTICAL_REGIME_CRON_TICK_MS=1800000",
    "TACTICAL_REGIME_NOTIFY_COOLDOWN_SEC=3600",
    "TACTICAL_REGIME_NOTIFY_ACTIONS=BUY,SCALP,AVOID",
    "TACTICAL_REGIME_WATCHLIST_LIMIT=15"
  ];

  console.log("railway variables set (", kvs.length, "keys, redacted ) + skip-deploys");
  railway(["variables", "set", ...kvs, "--skip-deploys"]);

  console.log("railway redeploy -y");
  railway(["redeploy", "-y"]);
  console.log("Done. Verify GET /health -> webPushVapidKeysConfigured, GET /api/v1/push/vapid-public-key");
}

main();
