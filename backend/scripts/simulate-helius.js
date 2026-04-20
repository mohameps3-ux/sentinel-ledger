#!/usr/bin/env node
/**
 * End-to-end smoke test for the score-emission pipeline.
 *
 * What it does
 * ------------
 * 1. Connects as a Socket.IO client to the running backend.
 * 2. Joins the `asset` room.
 * 3. POSTs a synthetic Helius enhanced-webhook payload to
 *    `POST /api/v1/webhooks/helius` (auth via HELIUS_WEBHOOK_SECRET).
 * 4. Validates the resulting `sentinel:score` event:
 *       - has top-level `asset` matching the mint we posted
 *       - has top-level `timestamp` (ISO-8601, within 10 s of now)
 *       - has `scores.{risk,smart,momentum}` ∈ [0,100]
 *       - has numeric `confidence` ∈ [0,100]
 * 5. When `--observe` is passed, stays connected and prints what the LED
 *    state would be (LIVE → SYNCING → DEGRADED) as score age increases,
 *    letting you visually confirm the frontend state machine.
 *
 * Usage
 * -----
 *   # Backend running on localhost:3000 with HELIUS_WEBHOOK_SECRET=dev
 *   HELIUS_WEBHOOK_SECRET=dev node backend/scripts/simulate-helius.js
 *
 *   # Pick an asset (any valid base58 pubkey between 32-44 chars)
 *   ASSET=So11111111111111111111111111111111111111112 \
 *   HELIUS_WEBHOOK_SECRET=dev node backend/scripts/simulate-helius.js
 *
 *   # Observe LED transitions for 40 seconds without further events
 *   HELIUS_WEBHOOK_SECRET=dev node backend/scripts/simulate-helius.js --observe
 *
 * Exit codes
 * ----------
 *   0  validation passed
 *   1  validation failed / backend unreachable / secret missing
 *   2  score event not received within the timeout window
 */

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.HELIUS_WEBHOOK_SECRET || "";
const ASSET =
  process.env.ASSET || "So11111111111111111111111111111111111111112"; // wrapped SOL, valid on-chain mint
const OBSERVE = process.argv.includes("--observe");
const RECEIVE_TIMEOUT_MS = Number(process.env.RECEIVE_TIMEOUT_MS || 8000);
const OBSERVE_DURATION_MS = Number(process.env.OBSERVE_DURATION_MS || 40_000);

const LED_THRESHOLDS = { LIVE_MAX_SEC: 10, SYNCING_MAX_SEC: 30 };

function derivedLedKey({ isConnected, lastScoreAt, nowMs, healthStatus }) {
  if (!isConnected) return "OFFLINE";
  if (healthStatus === "DEGRADED") return "DEGRADED";
  if (!lastScoreAt) return "WAITING";
  const age = Math.max(0, Math.floor((nowMs - lastScoreAt) / 1000));
  if (age > LED_THRESHOLDS.SYNCING_MAX_SEC) return "DEGRADED";
  if (age > LED_THRESHOLDS.LIVE_MAX_SEC) return "SYNCING";
  return "LIVE";
}

function fail(msg, details) {
  console.error(`[simulate-helius] FAIL · ${msg}`);
  if (details) console.error(details);
  process.exit(1);
}

function info(msg) {
  console.log(`[simulate-helius] ${msg}`);
}

function buildSyntheticPayload(asset) {
  // Two transfers → the webhook expands into 2 normalized tx events; one leg
  // will be a "buy" (to without from), which is what triggers most rules.
  const mockWallet = "BuyerWalletSimulatedForSentinelTesting11111";
  const signature = `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return [
    {
      signature,
      feePayer: mockWallet,
      timestamp: Math.floor(Date.now() / 1000),
      tokenTransfers: [
        {
          mint: asset,
          tokenAmount: 25_000,
          toUserAccount: mockWallet,
          fromUserAccount: null
        }
      ]
    }
  ];
}

async function post(url, body, headers) {
  // Use global fetch (Node 18+). The backend CI targets Node 20.
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body)
  });
  let parsed = null;
  try {
    parsed = await res.json();
  } catch (_) {}
  return { status: res.status, body: parsed };
}

function validateScorePayload(payload, expectedAsset) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    errors.push("payload is not an object");
    return errors;
  }
  if (payload.asset !== expectedAsset) {
    errors.push(`asset mismatch · expected=${expectedAsset} got=${payload.asset}`);
  }
  if (typeof payload.timestamp !== "string") {
    errors.push("timestamp missing or not a string");
  } else {
    const t = Date.parse(payload.timestamp);
    if (!Number.isFinite(t)) {
      errors.push(`timestamp not ISO-8601 parseable: ${payload.timestamp}`);
    } else {
      const drift = Math.abs(Date.now() - t);
      if (drift > 10_000) errors.push(`timestamp drift ${drift}ms exceeds 10s budget`);
    }
  }
  const s = payload.scores || {};
  for (const k of ["risk", "smart", "momentum"]) {
    const v = s[k];
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      errors.push(`scores.${k} out of range: ${v}`);
    }
  }
  if (!Number.isFinite(payload.confidence) || payload.confidence < 0 || payload.confidence > 100) {
    errors.push(`confidence out of range: ${payload.confidence}`);
  }
  if (!Array.isArray(payload.signals)) errors.push("signals is not an array");
  if (!Array.isArray(payload.insights)) errors.push("insights is not an array");
  return errors;
}

(async () => {
  if (!SECRET) fail("HELIUS_WEBHOOK_SECRET env var is required");

  let io;
  try {
    ({ io } = require("socket.io-client"));
  } catch (_) {
    fail("socket.io-client not installed — run `npm i` inside backend/");
  }

  info(`backend=${BACKEND_URL} asset=${ASSET} observe=${OBSERVE}`);
  const socket = io(BACKEND_URL, {
    transports: ["websocket", "polling"],
    reconnection: false,
    timeout: 5000
  });

  let connected = false;
  let lastScoreAt = null;
  let lastScore = null;
  const receivedEvents = [];
  const onScore = (payload) => {
    receivedEvents.push(payload);
    lastScore = payload;
    const ts = payload?.timestamp ? Date.parse(payload.timestamp) : NaN;
    lastScoreAt = Number.isFinite(ts) ? ts : Date.now();
  };
  socket.on("connect", () => {
    connected = true;
    info(`socket connected · id=${socket.id}`);
    socket.emit("join-token", ASSET);
  });
  socket.on("disconnect", (reason) => {
    connected = false;
    info(`socket disconnected · ${reason}`);
  });
  socket.on("sentinel:score", onScore);

  // Wait for socket to connect first, then POST.
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("socket connect timeout")), 5000);
    socket.once("connect", () => {
      clearTimeout(to);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(to);
      reject(err);
    });
  }).catch((err) => fail("could not connect socket", err?.message || err));

  // Small breath to make sure join-token was processed server-side.
  await new Promise((r) => setTimeout(r, 200));

  const body = buildSyntheticPayload(ASSET);
  info(`POST /api/v1/webhooks/helius · 1 tx, 1 transfer`);
  const { status, body: resBody } = await post(
    `${BACKEND_URL}/api/v1/webhooks/helius`,
    body,
    { "x-helius-secret": SECRET }
  );
  if (status >= 400) {
    fail(`webhook POST returned ${status}`, resBody);
  }
  info(`webhook accepted · status=${status} body=${JSON.stringify(resBody)}`);

  // Wait for sentinel:score to arrive.
  const deadline = Date.now() + RECEIVE_TIMEOUT_MS;
  while (Date.now() < deadline && receivedEvents.length === 0) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (receivedEvents.length === 0) {
    socket.close();
    console.error("[simulate-helius] FAIL · no sentinel:score received within " + RECEIVE_TIMEOUT_MS + "ms");
    process.exit(2);
  }

  const first = receivedEvents[0];
  info(`received sentinel:score · ${JSON.stringify(first, null, 2)}`);
  const errors = validateScorePayload(first, ASSET);
  if (errors.length) {
    socket.close();
    console.error("[simulate-helius] FAIL · payload validation errors:");
    for (const e of errors) console.error(`   - ${e}`);
    process.exit(1);
  }
  info("payload validation OK · asset, timestamp, scores, confidence, signals, insights");

  if (!OBSERVE) {
    socket.close();
    info("done · pass");
    process.exit(0);
  }

  // ---- Observer mode: print synthetic LED state every second ----
  info(`observing LED transitions for ${OBSERVE_DURATION_MS}ms (no further events will be sent)`);
  info("expected: LIVE (0-10s) → SYNCING (10-30s) → DEGRADED (>30s)");
  const start = Date.now();
  let lastLedKey = null;
  const tick = setInterval(() => {
    const ledKey = derivedLedKey({
      isConnected: connected,
      lastScoreAt,
      nowMs: Date.now(),
      healthStatus: null
    });
    if (ledKey !== lastLedKey) {
      const age = lastScoreAt ? Math.floor((Date.now() - lastScoreAt) / 1000) : "—";
      info(`LED → ${ledKey} · score_age=${age}s`);
      lastLedKey = ledKey;
    }
    if (Date.now() - start >= OBSERVE_DURATION_MS) {
      clearInterval(tick);
      socket.close();
      info("observe done · pass");
      process.exit(0);
    }
  }, 1000);

  process.on("SIGINT", () => {
    clearInterval(tick);
    socket.close();
    process.exit(130);
  });
})().catch((err) => fail("unexpected failure", err?.stack || String(err)));
