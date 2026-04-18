const IORedis = require("ioredis");

let connection = null;

function getRedisUrl() {
  return process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || "";
}

function getBullmqConnection() {
  if (connection) return connection;
  const redisUrl = getRedisUrl();
  if (!redisUrl) return null;
  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
  return connection;
}

module.exports = { getBullmqConnection };

