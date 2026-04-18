require("dotenv").config();
const IORedis = require("ioredis");
const { Queue } = require("bullmq");

function getRedisUrl() {
  return process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || "";
}

async function main() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    console.error("Missing REDIS_URL or UPSTASH_REDIS_URL");
    process.exit(1);
  }

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
  const queueNames = ["deployer-analysis", "smart-wallet-analysis"];

  for (const name of queueNames) {
    const queue = new Queue(name, { connection });
    try {
      await queue.obliterate({ force: true });
      console.log(`OK: cleaned queue ${name}`);
    } catch (error) {
      console.warn(`WARN: could not clean ${name}: ${error.message}`);
    } finally {
      await queue.close();
    }
  }

  await connection.quit();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

