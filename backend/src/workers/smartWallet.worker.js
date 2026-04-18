const { Worker } = require("bullmq");
const { getBullmqConnection } = require("../lib/bullmq");
const { analyzeWallet } = require("../services/analyzeWallet");

let workerInstance = null;

function startSmartWalletWorker() {
  if (workerInstance) return workerInstance;
  const connection = getBullmqConnection();
  if (!connection) {
    console.warn("Smart wallet worker skipped: REDIS_URL/UPSTASH_REDIS_URL not configured.");
    return null;
  }

  workerInstance = new Worker(
    "smart-wallet-analysis",
    async (job) => {
      const walletAddress = job?.data?.walletAddress;
      if (!walletAddress) return null;
      return analyzeWallet(walletAddress);
    },
    { connection, concurrency: 4 }
  );

  workerInstance.on("completed", (job) =>
    console.log(`Smart wallet analyzed: ${job?.data?.walletAddress || "unknown"}`)
  );
  workerInstance.on("failed", (job, err) =>
    console.error(`Smart wallet failed: ${job?.data?.walletAddress || "unknown"} - ${err.message}`)
  );
  return workerInstance;
}

module.exports = { startSmartWalletWorker };

