const IORedis = require("ioredis");

let connection = null;
let loggedConnect = false;

/** BullMQ TCP URL — dedicated instance preferred; legacy fallbacks preserve pre-split behavior. */
function getBullmqRedisUrl() {
  const url =
    process.env.BULLMQ_REDIS_URL ||
    process.env.REDIS_URL ||
    process.env.UPSTASH_REDIS_URL ||
    "";
  return String(url).trim();
}

function bullmqRedisHostForLog(redisUrl) {
  try {
    const u = new URL(redisUrl);
    const user = u.username ? `${u.username}@` : "";
    return `${user}${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return "(unparseable-url)";
  }
}

function getBullmqConnection() {
  if (connection) return connection;
  const redisUrl = getBullmqRedisUrl();
  if (!redisUrl) return null;
  if (!loggedConnect) {
    console.log(`[bullmq] connecting to redis host=${bullmqRedisHostForLog(redisUrl)}`);
    loggedConnect = true;
  }
  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
  return connection;
}

module.exports = { getBullmqConnection, getBullmqRedisUrl };
