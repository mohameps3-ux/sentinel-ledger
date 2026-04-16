const { Worker } = require("bullmq");
const { makeConnection } = require("../lib/queue");
const { processDeployerReputationJob } = require("../services/deployerService");

let workerInstance = null;

function startDeployerWorker() {
  if (workerInstance) return workerInstance;

  const connection = makeConnection();
  if (!connection) {
    console.warn("Deployer worker disabled: UPSTASH_REDIS_URL missing.");
    return null;
  }

  workerInstance = new Worker(
    "deployer-analysis",
    async (job) => {
      await processDeployerReputationJob(job.data);
    },
    { connection }
  );

  workerInstance.on("completed", (job) => {
    console.log(`deployer worker completed job ${job.id}`);
  });
  workerInstance.on("failed", (job, err) => {
    console.error(`deployer worker failed job ${job?.id}:`, err.message);
  });

  return workerInstance;
}

module.exports = { startDeployerWorker };

