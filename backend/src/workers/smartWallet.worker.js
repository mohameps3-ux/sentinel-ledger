const { Worker } = require("bullmq");
const { getBullmqConnection } = require("../lib/bullmq");
const { analyzeWallet } = require("../services/analyzeWallet");
const { CRON_RETRY_JOB_NAME, enqueueActiveWallets } = require("../jobs/smartWalletCron");

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
      if (job.name === CRON_RETRY_JOB_NAME) {
        return enqueueActiveWallets({ skipWebhookDefer: Boolean(job?.data?.skipWebhookDefer) });
      }
      const walletAddress = job?.data?.walletAddress;
      if (!walletAddress) return null;
      return analyzeWallet(walletAddress);
    },
    { connection, concurrency: 4 }
  );

  workerInstance.on("completed", (job) => {
    if (job?.name === CRON_RETRY_JOB_NAME) {
      console.log("[smart-wallet-cron] deferred BullMQ retry completed");
      return;
    }
    console.log(`Smart wallet analyzed: ${job?.data?.walletAddress || "unknown"}`);
  });
  workerInstance.on("failed", (job, err) => {
    if (job?.name === CRON_RETRY_JOB_NAME) {
      console.error(`[smart-wallet-cron] deferred BullMQ retry failed: ${err.message}`);
      return;
    }
    console.error(`Smart wallet failed: ${job?.data?.walletAddress || "unknown"} - ${err.message}`);
  });
  return workerInstance;
}

module.exports = { startSmartWalletWorker };

