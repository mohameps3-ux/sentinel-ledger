"use strict";

/**
 * Unit tests for signalCardScore. Run: node backend/test-signalCardScore.js
 */

const assert = require("assert");
const {
  resolveBaseSentinelScoreAtEmission,
  engineDimensionsBaseScore,
  confidenceFallbackBaseScore,
  avgWalletSentinel
} = require("./src/services/signalCardScore");

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

function mockSupabaseWithWallets(rows) {
  return {
    from(table) {
      assert.strictEqual(table, "smart_wallets");
      return {
        select() {
          return {
            in(_col, _addrs) {
              return Promise.resolve({ data: rows, error: null });
            }
          };
        }
      };
    }
  };
}

function mockSupabaseEmpty() {
  return mockSupabaseWithWallets([]);
}

(async () => {
  console.log("signalCardScore tests");

  test("engineDimensionsBaseScore matches gate quality weights", () => {
    const s = engineDimensionsBaseScore({
      scores: { risk: 45, smart: 55, momentum: 50 }
    });
    assert.strictEqual(s, 53);
  });

  test("confidenceFallbackBaseScore uses confidence*0.92 clamped 40-100", () => {
    assert.strictEqual(confidenceFallbackBaseScore({ confidence: 70 }), 64);
  });

  test("avgWalletSentinel averages wallet dimension triples", () => {
    const avg = avgWalletSentinel([
      { early_entry_score: 90, cluster_score: 90, consistency_score: 90 },
      { early_entry_score: 60, cluster_score: 60, consistency_score: 60 }
    ]);
    assert.strictEqual(avg, 75);
  });

  await test("wallet hit → avgWalletSentinel base used", async () => {
    const supabase = mockSupabaseWithWallets([
      {
        wallet_address: "WalletA",
        early_entry_score: 84,
        cluster_score: 84,
        consistency_score: 84
      }
    ]);
    const score = await resolveBaseSentinelScoreAtEmission(
      supabase,
      { confidence: 40, scores: { risk: 10, smart: 10, momentum: 10 } },
      ["WalletA"]
    );
    assert.strictEqual(score, 84);
  });

  await test("wallet miss but scores present → engine blend used", async () => {
    const supabase = mockSupabaseEmpty();
    const score = await resolveBaseSentinelScoreAtEmission(supabase, {
      confidence: 90,
      scores: { risk: 45, smart: 55, momentum: 50 }
    });
    assert.strictEqual(score, 53);
  });

  await test("no wallets and no scores → confidence*0.92 last resort", async () => {
    const supabase = mockSupabaseEmpty();
    const score = await resolveBaseSentinelScoreAtEmission(supabase, { confidence: 70 });
    assert.strictEqual(score, 64);
  });

  await test("meta.wallets used when walletAddresses omitted", async () => {
    const supabase = mockSupabaseWithWallets([
      {
        wallet_address: "ClusterW1",
        early_entry_score: 70,
        cluster_score: 70,
        consistency_score: 70
      }
    ]);
    const score = await resolveBaseSentinelScoreAtEmission(supabase, {
      meta: { wallets: ["ClusterW1"] },
      scores: { risk: 0, smart: 0, momentum: 0 }
    });
    assert.strictEqual(score, 70);
  });

  console.log(`\n${passed} passed`);
  if (process.exitCode) process.exit(process.exitCode);
})();
