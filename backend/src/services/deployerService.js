const axios = require("axios");
const { clusterApiUrl } = require("@solana/web3.js");
const { getSupabase } = require("../lib/supabase");
const { deployerQueue } = require("../lib/queue");

function getRpcUrls() {
  const urls = [];
  if (process.env.HELIUS_KEY) {
    urls.push(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`);
  }
  urls.push(clusterApiUrl("mainnet-beta"));
  return [...new Set(urls)];
}

async function rpcPost(payload) {
  let lastError = null;
  for (const url of getRpcUrls()) {
    try {
      const { data } = await axios.post(url, payload, { timeout: 8000 });
      if (data?.error) throw new Error(data.error.message || "rpc_error");
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("all_rpc_failed");
}

async function getDeployerInfo(deployerAddress) {
  if (!deployerAddress) return null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("deployer_history")
      .select("*")
      .eq("wallet_address", deployerAddress)
      .single();

    if (error || !data) return null;

    return {
      address: data.wallet_address,
      totalLaunches: data.total_launches || 0,
      rugCount: data.rug_count || 0,
      riskScore: data.risk_score || 0
    };
  } catch (error) {
    console.error("Error fetching deployer info:", error.message);
    return null;
  }
}

async function analyzeDeployerOnChain(deployerAddress) {
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

  return {
    wallet_address: deployerAddress,
    total_launches: totalLaunches,
    rug_count: rugCount,
    risk_score: riskScore,
    funding_source: "unknown",
    last_launch: lastLaunch,
    updated_at: new Date().toISOString()
  };
}

async function upsertDeployerHistory(record) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("deployer_history")
    .upsert(record, { onConflict: "wallet_address" });
  if (error) throw error;
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

