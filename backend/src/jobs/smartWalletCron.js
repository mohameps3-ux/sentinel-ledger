const { getSupabase } = require("../lib/supabase");
const { getSmartWalletQueue } = require("../queues/smartWallet.queue");
const { analyzeWallet } = require("../services/analyzeWallet");

let intervalRef = null;

function getDirectLimit() {
  const raw = Number(process.env.SMART_WALLET_DIRECT_LIMIT || 20);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.min(100, Math.floor(raw));
}

async function enqueueActiveWallets() {
  const queue = getSmartWalletQueue();

  const supabase = getSupabase();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("wallet_tokens")
    .select("wallet_address")
    .gte("bought_at", sevenDaysAgo);
  if (error) {
    console.warn("smart wallet cron skipped:", error.message);
    return 0;
  }

  const counts = new Map();
  for (const row of data || []) {
    const key = row?.wallet_address;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const topWallets = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([addr]) => addr);
  let targetWallets = topWallets;

  if (!targetWallets.length) {
    const { data: seedRows, error: seedError } = await supabase
      .from("smart_wallets")
      .select("wallet_address")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (seedError) {
      console.warn("smart wallet seed fallback skipped:", seedError.message);
    } else {
      targetWallets = (seedRows || []).map((row) => row?.wallet_address).filter(Boolean);
    }
  }

  if (!queue) {
    const directLimit = getDirectLimit();
    const sample = targetWallets.slice(0, directLimit);
    let ok = 0;
    for (const walletAddress of sample) {
      try {
        await analyzeWallet(walletAddress);
        ok += 1;
      } catch (error) {
        console.warn(`smart wallet direct analysis failed (${walletAddress}): ${error.message}`);
      }
    }
    console.log(`Smart wallet direct analysis complete: ${ok}/${sample.length}`);
    return ok;
  }

  for (const walletAddress of targetWallets) {
    await queue.add(
      "analyze-wallet",
      { walletAddress },
      {
        jobId: `smart-wallet:${walletAddress}`,
        removeOnComplete: 500,
        removeOnFail: 500
      }
    );
  }
  console.log(`Smart wallet cron enqueued: ${targetWallets.length}`);
  return targetWallets.length;
}

function startSmartWalletCron() {
  if (intervalRef) return;
  enqueueActiveWallets().catch((e) => console.warn("smart wallet bootstrap enqueue:", e.message));
  intervalRef = setInterval(() => {
    enqueueActiveWallets().catch((e) => console.warn("smart wallet scheduled enqueue:", e.message));
  }, 60 * 60 * 1000);
}

module.exports = { enqueueActiveWallets, startSmartWalletCron };

