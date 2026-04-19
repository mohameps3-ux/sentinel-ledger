const { getSupabase } = require("../lib/supabase");
const { deployerQueue } = require("../lib/queue");
const { getSolanaJsonRpcUrlList, jsonRpcPost } = require("../lib/solanaJsonRpc");
const redis = require("../lib/cache");
const axios = require("axios");

async function rpcPost(payload) {
  let lastError = null;
  for (const url of getSolanaJsonRpcUrlList()) {
    try {
      return await jsonRpcPost(url, payload, { timeout: 8000 });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("all_rpc_failed");
}

async function getDeployerInfo(deployerAddress) {
  if (!deployerAddress) return null;
  const cacheKey = `deployer:dna:v2:${deployerAddress}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached && typeof cached === "object") return cached;
  } catch (_) {}

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("deployer_history")
      .select("*")
      .eq("wallet_address", deployerAddress)
      .single();

    if (error || !data) return null;

    const payload = {
      address: data.wallet_address,
      totalLaunches: data.total_launches || 0,
      rugCount: data.rug_count || 0,
      riskScore: data.risk_score || 0,
      successRate: Number(data.success_rate || 0),
      averageHoursToRug: data.average_hours_to_rug != null ? Number(data.average_hours_to_rug) : null,
      deployerLabel: data.deployer_label || "First Launch",
      launchSampleSize: Number(data.launch_sample_size || data.total_launches || 0),
      source: "db"
    };
    try {
      await redis.set(cacheKey, payload, { ex: 3600 });
    } catch (_) {}
    return payload;
  } catch (error) {
    console.error("Error fetching deployer info:", error.message);
    return null;
  }
}

async function fetchHeliusAddressTransactions(walletAddress, limit = 120) {
  const apiKey = process.env.HELIUS_KEY;
  if (!apiKey || !walletAddress) return [];
  const capped = Math.min(200, Math.max(20, Number(limit) || 120));
  const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${encodeURIComponent(
    walletAddress
  )}/transactions?api-key=${encodeURIComponent(apiKey)}&limit=${capped}`;
  try {
    const { data, status } = await axios.get(url, { timeout: 15000, validateStatus: () => true });
    if (status !== 200 || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

function inferDeployerLabel(totalLaunches, successRate) {
  if (totalLaunches <= 1) return "First Launch";
  if (totalLaunches >= 12) return "Whale Deployer";
  if (totalLaunches >= 4 && successRate < 35) return "Serial Rugger";
  if (totalLaunches >= 3 && successRate >= 60) return "Consistent Builder";
  return "First Launch";
}

async function analyzeDeployerOnChain(deployerAddress) {
  const heliusTx = await fetchHeliusAddressTransactions(deployerAddress, 120);
  const launchRegex = /(create|initialize).*(token|mint)|token.*launch/i;
  const rugRegex = /(remove.*liquidity|rug|dump|sell.*all)/i;
  const launchRows = [];
  const rugDurationsHours = [];

  if (heliusTx.length) {
    for (const tx of heliusTx) {
      const ts = Number(tx?.timestamp || 0);
      const description = String(tx?.description || "");
      const isLaunch = launchRegex.test(description);
      if (!isLaunch) continue;
      launchRows.push({ ts, description });
    }
    for (const launch of launchRows) {
      const rugTx = heliusTx.find((tx) => {
        const ts = Number(tx?.timestamp || 0);
        if (!ts || ts <= launch.ts) return false;
        if (ts - launch.ts > 7 * 24 * 3600) return false;
        return rugRegex.test(String(tx?.description || ""));
      });
      if (rugTx?.timestamp) {
        rugDurationsHours.push(Number(((rugTx.timestamp - launch.ts) / 3600).toFixed(2)));
      }
    }
  }

  if (launchRows.length) {
    const totalLaunches = launchRows.length;
    const rugCount = rugDurationsHours.length;
    const successRate = Number((((totalLaunches - rugCount) / Math.max(1, totalLaunches)) * 100).toFixed(2));
    const averageHoursToRug =
      rugDurationsHours.length > 0
        ? Number((rugDurationsHours.reduce((a, b) => a + b, 0) / rugDurationsHours.length).toFixed(2))
        : null;
    const riskScore = Math.min(100, Math.round(Math.max(0, 100 - successRate + rugCount * 6)));
    return {
      wallet_address: deployerAddress,
      total_launches: totalLaunches,
      rug_count: rugCount,
      risk_score: riskScore,
      funding_source: "helius_history",
      last_launch: launchRows[0]?.ts ? new Date(launchRows[0].ts * 1000).toISOString() : null,
      success_rate: successRate,
      average_hours_to_rug: averageHoursToRug,
      deployer_label: inferDeployerLabel(totalLaunches, successRate),
      launch_sample_size: totalLaunches,
      updated_at: new Date().toISOString()
    };
  }

  const signaturesResponse = await rpcPost({
    jsonrpc: "2.0",
    id: "deployer-signatures",
    method: "getSignaturesForAddress",
    params: [deployerAddress, { limit: 50 }]
  });

  const signatures = signaturesResponse.result || [];
  let totalLaunches = 0;
  let lastLaunch = null;

  for (const sig of signatures.slice(0, 30)) {
    try {
      const txResponse = await rpcPost({
        jsonrpc: "2.0",
        id: "deployer-tx",
        method: "getTransaction",
        params: [sig.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }]
      });
      const logs = txResponse.result?.meta?.logMessages || [];
      const hasMintInit = logs.some((l) => /initialize.*mint|InitializeMint/.test(l));
      if (hasMintInit) {
        totalLaunches += 1;
        if (!lastLaunch) lastLaunch = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null;
      }
    } catch (error) {
      // Ignore individual tx failures.
    }
  }

  const rugCount = 0;
  const riskScore = Math.min(100, totalLaunches * 10 + rugCount * 30);
  const successRate = Number((((totalLaunches - rugCount) / Math.max(1, totalLaunches || 1)) * 100).toFixed(2));

  return {
    wallet_address: deployerAddress,
    total_launches: totalLaunches,
    rug_count: rugCount,
    risk_score: riskScore,
    funding_source: "unknown",
    last_launch: lastLaunch,
    success_rate: successRate,
    average_hours_to_rug: null,
    deployer_label: inferDeployerLabel(totalLaunches, successRate),
    launch_sample_size: totalLaunches,
    updated_at: new Date().toISOString()
  };
}

async function upsertDeployerHistory(record) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("deployer_history")
    .upsert(record, { onConflict: "wallet_address" });
  if (error) throw error;
  try {
    await redis.del(`deployer:dna:v2:${record.wallet_address}`);
  } catch (_) {}
}

async function processDeployerReputationJob(payload) {
  const deployerAddress = payload?.deployerAddress;
  if (!deployerAddress) return;
  const stats = await analyzeDeployerOnChain(deployerAddress);
  await upsertDeployerHistory(stats);
}

async function updateDeployerReputation(deployerAddress) {
  if (!deployerAddress) return;
  if (deployerQueue) {
    await deployerQueue.add(
      "analyze-deployer",
      { deployerAddress },
      {
        removeOnComplete: true,
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 }
      }
    );
    return;
  }

  // Fallback for environments without BullMQ connection.
  await processDeployerReputationJob({ deployerAddress });
}

module.exports = {
  getDeployerInfo,
  updateDeployerReputation,
  processDeployerReputationJob
};

