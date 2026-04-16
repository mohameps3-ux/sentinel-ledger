const { Queue } = require("bullmq");
const IORedis = require("ioredis");

function makeConnection() {
  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) return null;
  return new IORedis(url, {
    maxRetriesPerRequest: null
  });
}

const connection = makeConnection();
const deployerQueue = connection
  ? new Queue("deployer-analysis", { connection })
  : null;

module.exports = { deployerQueue };

