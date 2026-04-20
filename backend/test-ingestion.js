"use strict";

/**
 * Lightweight smoke tests for the ingestion contracts. Run with `node backend/test-ingestion.js`.
 * Avoids any external infra: dedupe falls back to in-memory cache when Upstash is absent.
 */

const assert = require("assert");

const {
  normalizeEvent,
  assertSentinelEvent,
  computeEventId
} = require("./src/ingestion/sentinelEvent");
const {
  reserveEventId,
  isReserved,
  getDedupeStats,
  _resetDedupeStats
} = require("./src/ingestion/dedupe");
const {
  recordRawReceived,
  recordEventEmitted,
  recordChainTip,
  updateBufferDepth,
  getIngestionSnapshot,
  _resetIngestionState
} = require("./src/ingestion/ingestionState");
const {
  _rules,
  _computeConfidence,
  _confidenceLabel,
  _CONFIG: SCORING_CONFIG,
  evaluate: evaluateScore
} = require("./src/scoring/engine");
const {
  recordAssetEvent,
  getAssetStats,
  _resetScoringState
} = require("./src/scoring/state");

let passed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      return r.then(
        () => {
          passed += 1;
          console.log(`  ok ${name}`);
        },
        (e) => {
          console.error(`  FAIL ${name}:`, e.message);
          process.exitCode = 1;
        }
      );
    }
    passed += 1;
    console.log(`  ok ${name}`);
    return null;
  } catch (e) {
    console.error(`  FAIL ${name}:`, e.message);
    process.exitCode = 1;
    return null;
  }
}

(async () => {
  console.log("ingestion contract tests");

  // 1. SentinelEvent: required fields rejected.
  test("normalizeEvent rejects missing network", () => {
    assert.throws(
      () =>
        normalizeEvent({
          type: "TRANSFER",
          source: "x",
          signature: "s",
          blockNumber: 1,
          data: { actor: "a", asset: "b", amount: "1" }
        }),
      /sentinel_event_invalid_network/
    );
  });

  test("normalizeEvent rejects bad type", () => {
    assert.throws(
      () =>
        normalizeEvent({
          network: "solana",
          type: "BOGUS",
          source: "x",
          signature: "s",
          blockNumber: 1,
          data: { actor: "a", asset: "b", amount: "1" }
        }),
      /sentinel_event_invalid_type/
    );
  });

  test("normalizeEvent rejects missing actor/asset/amount", () => {
    assert.throws(() =>
      normalizeEvent({
        network: "solana",
        type: "SWAP",
        source: "x",
        signature: "s",
        blockNumber: 1,
        data: { actor: "", asset: "b", amount: "1" }
      })
    );
  });

  // 2. Determinism + uniqueness.
  test("computeEventId is deterministic for same seed", () => {
    const a = computeEventId({
      source: "helius_webhook",
      blockHash: "h",
      blockNumber: 10,
      signature: "sig",
      logIndex: 0
    });
    const b = computeEventId({
      source: "helius_webhook",
      blockHash: "h",
      blockNumber: 10,
      signature: "sig",
      logIndex: 0
    });
    assert.strictEqual(a, b);
    assert.strictEqual(a.length, 64);
  });

  test("computeEventId differs when logIndex changes", () => {
    const a = computeEventId({ source: "s", signature: "x", blockNumber: 1, logIndex: 0 });
    const b = computeEventId({ source: "s", signature: "x", blockNumber: 1, logIndex: 1 });
    assert.notStrictEqual(a, b);
  });

  // 3. Happy path event passes assertion.
  const happy = normalizeEvent({
    network: "solana",
    type: "SWAP",
    source: "helius_webhook",
    signature: "sigAAA",
    blockNumber: 99,
    blockHash: "blockHashXYZ",
    logIndex: 2,
    data: { actor: "Wallet1", asset: "Mint1", amount: "12345.6789" },
    metadata: { confidence: 1.5, labels: ["smart-money", 42, "new-wallet"] }
  });
  test("happy event passes assertSentinelEvent", () => assertSentinelEvent(happy));
  test("confidence is clamped to [0,1]", () =>
    assert.strictEqual(happy.metadata.confidence, 1));
  test("labels filter non-strings", () =>
    assert.deepStrictEqual(happy.metadata.labels, ["smart-money", "new-wallet"]));
  test("amount is preserved as string", () =>
    assert.strictEqual(happy.data.amount, "12345.6789"));

  // 4. Dedup behaviour.
  _resetDedupeStats();
  await test("first reserve wins, second is duplicate", async () => {
    const id = "deadbeef".repeat(8); // 64 chars
    const r1 = await reserveEventId(id);
    assert.strictEqual(r1.duplicate, false);
    assert.strictEqual(r1.reserved, true);
    const r2 = await reserveEventId(id);
    assert.strictEqual(r2.duplicate, true);
    const stats = getDedupeStats();
    assert.strictEqual(stats.attempts, 2);
    assert.strictEqual(stats.unique, 1);
    assert.strictEqual(stats.duplicates, 1);
    assert.ok(stats.duplicateRate > 0);
    assert.strictEqual(await isReserved(id), true);
  });

  // 5. Ingestion state thresholds.
  _resetIngestionState();
  test("snapshot reports WAITING when no events seen", () => {
    const snap = getIngestionSnapshot();
    assert.strictEqual(snap.ingestionStatus, "WAITING");
    assert.strictEqual(snap.syncStatus, "SYNCED");
  });

  test("recordEventEmitted updates network/source counters", () => {
    recordRawReceived("helius_webhook");
    recordEventEmitted(happy, 12);
    const snap = getIngestionSnapshot();
    assert.strictEqual(snap.totalEventsEmitted, 1);
    assert.strictEqual(snap.networks.solana.eventsTotal, 1);
    assert.strictEqual(snap.networks.solana.lastBlockProcessed, 99);
    assert.ok(snap.normalizationLatencyEmaMs >= 0);
  });

  test("chain lag > 50 marks LAGGING", () => {
    recordChainTip("solana", 99 + 60);
    const snap = getIngestionSnapshot();
    assert.strictEqual(snap.networks.solana.lag, 60);
    assert.strictEqual(snap.networks.solana.healthy, false);
    assert.ok(snap.syncStatus.includes("LAGGING") || snap.syncStatus === "LAGGING");
  });

  test("buffer > 5000 triggers BACKPRESSURE", () => {
    updateBufferDepth(5001);
    const snap = getIngestionSnapshot();
    assert.ok(snap.syncStatus.includes("BACKPRESSURE"));
    assert.match(snap.syncReason || "", /buffer/);
  });

  /* ────────────── Scoring engine: 5 Golden Rules + confidence ────────────── */
  console.log("\nscoring engine tests");
  _resetScoringState();

  function makeEvent(overrides = {}) {
    const base = {
      id: "x".repeat(64),
      network: "solana",
      type: "SWAP",
      source: "helius_webhook",
      timestamp: Date.now(),
      blockNumber: 100,
      signature: "sig",
      data: { actor: "WalletA", asset: "Mint1", amount: "1" },
      metadata: { confidence: 0.9, labels: ["buy"], processingTime: 0 }
    };
    return {
      ...base,
      ...overrides,
      data: { ...base.data, ...(overrides.data || {}) },
      metadata: { ...base.metadata, ...(overrides.metadata || {}) }
    };
  }

  test("rule_whale_accumulation fires only for elite + buyish + USD over threshold", () => {
    const event = makeEvent();
    assert.strictEqual(_rules.ruleWhaleAccumulation({ event, isElite: false, amountUsd: 999_999 }), null);
    assert.strictEqual(_rules.ruleWhaleAccumulation({ event, isElite: true, amountUsd: 100 }), null);
    const r = _rules.ruleWhaleAccumulation({ event, isElite: true, amountUsd: SCORING_CONFIG.whaleMinUsd });
    assert.ok(r && r.delta.smart === 40 && r.signal === "whale_accumulation");
  });

  test("rule_liquidity_shock requires liquidity context", () => {
    const event = makeEvent();
    assert.strictEqual(
      _rules.ruleLiquidityShock({ event, amountUsd: 10_000, liquidityUsd: null }),
      null
    );
    assert.strictEqual(
      _rules.ruleLiquidityShock({ event, amountUsd: 10_000, liquidityUsd: 1_000_000 }),
      null
    );
    const r = _rules.ruleLiquidityShock({ event, amountUsd: 10_000, liquidityUsd: 100_000 });
    assert.ok(r && r.delta.momentum === 25 && r.delta.risk === -10);
  });

  test("rule_cluster_buy fires when N+ unique buyers in window", () => {
    const event = makeEvent();
    assert.strictEqual(
      _rules.ruleClusterBuy({ event, assetStats: { uniqueWalletsInWindow: 1 } }),
      null
    );
    const r = _rules.ruleClusterBuy({
      event,
      assetStats: { uniqueWalletsInWindow: SCORING_CONFIG.clusterMinWallets }
    });
    assert.ok(r && r.delta.smart === 30 && r.delta.momentum === 20);
  });

  test("rule_new_wallet_confidence fires only with ageMs known + under threshold + USD over min", () => {
    const event = makeEvent();
    assert.strictEqual(
      _rules.ruleNewWalletConfidence({ event, walletAgeMs: null, amountUsd: 10_000 }),
      null
    );
    assert.strictEqual(
      _rules.ruleNewWalletConfidence({
        event,
        walletAgeMs: SCORING_CONFIG.newWalletMaxAgeMs + 1,
        amountUsd: 10_000
      }),
      null
    );
    const r = _rules.ruleNewWalletConfidence({
      event,
      walletAgeMs: 60_000,
      amountUsd: SCORING_CONFIG.newWalletMinUsd
    });
    assert.ok(r && r.delta.risk === 35);
  });

  test("rule_velocity_spike requires baseline >= min and ratio over multiplier", () => {
    const event = makeEvent();
    assert.strictEqual(
      _rules.ruleVelocitySpike({ event, assetStats: { txLastMin: 10, baselinePerMin: 0.5 } }),
      null
    );
    const r = _rules.ruleVelocitySpike({
      event,
      assetStats: {
        txLastMin: SCORING_CONFIG.velocityMultiplier * 2,
        baselinePerMin: 1
      }
    });
    assert.ok(r && r.delta.momentum === 30);
  });

  test("confidence formula clamps and reflects evidence", () => {
    assert.strictEqual(_computeConfidence({ rulesTriggered: 0, uniqueWallets: 0, recentActivityBoost: 0, contradictions: 0 }), 0);
    assert.strictEqual(_computeConfidence({ rulesTriggered: 5, uniqueWallets: 5, recentActivityBoost: 25, contradictions: 0 }), 100);
    const dropped = _computeConfidence({ rulesTriggered: 3, uniqueWallets: 3, recentActivityBoost: 10, contradictions: 2 });
    assert.ok(dropped >= 0 && dropped <= 100);
    assert.strictEqual(_confidenceLabel(80), "High");
    assert.strictEqual(_confidenceLabel(50), "Medium");
    assert.strictEqual(_confidenceLabel(10), "Low");
  });

  test("asset stats: cluster window counts unique buyers and excludes the past", () => {
    _resetScoringState();
    const now = Date.now();
    const asset = "MintCluster";
    const wallets = ["W1", "W2", "W3", "W4"];
    wallets.forEach((w, i) => {
      recordAssetEvent(makeEvent({
        timestamp: now - i * 5000, // all within 40s window
        data: { actor: w, asset },
        metadata: { labels: ["buy"], confidence: 0.9 }
      }));
    });
    // One stale buyer (older than the cluster window) — must NOT count.
    recordAssetEvent(makeEvent({
      timestamp: now - 120_000,
      data: { actor: "WStale", asset },
      metadata: { labels: ["buy"], confidence: 0.9 }
    }));
    const stats = getAssetStats(asset, { nowMs: now, clusterWindowMs: 40_000 });
    assert.strictEqual(stats.uniqueWalletsInWindow, 4);
    assert.ok(stats.eventsInWindow >= 4);
  });

  await test("evaluate(event) yields a complete ScoringResult and never throws on missing ctx", async () => {
    _resetScoringState();
    const event = makeEvent({
      id: "a".repeat(64),
      data: { actor: "WalletEval", asset: "MintEval", amount: "1" }
    });
    const result = await evaluateScore(event);
    assert.ok(result, "evaluate must return a result");
    assert.ok(["Low", "Medium", "High"].includes(result.confidenceLabel));
    assert.ok(result.scores.risk >= 0 && result.scores.risk <= 100);
    assert.ok(result.scores.smart >= 0 && result.scores.smart <= 100);
    assert.ok(result.scores.momentum >= 0 && result.scores.momentum <= 100);
    assert.ok(Array.isArray(result.signals));
    assert.ok(Array.isArray(result.insights));
    assert.strictEqual(result.signals.length, result.insights.length);
  });

  console.log(`\nall tests passed (${passed})`);
})();
