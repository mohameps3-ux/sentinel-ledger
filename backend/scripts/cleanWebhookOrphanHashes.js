"use strict";
/**
 * One-shot: delete orphaned bull:webhook-scoring:webhook_* hashes (protected active/wait/delayed).
 * Run on prod: railway run node scripts/cleanWebhookOrphanHashes.js
 */
require("dotenv").config();
const IORedis = require("ioredis");
const { getBullmqRedisUrl } = require("../src/lib/bullmq");

async function main() {
  const url = getBullmqRedisUrl();
  if (!url) {
    console.error("Missing BULLMQ_REDIS_URL / REDIS_URL / UPSTASH_REDIS_URL");
    process.exit(1);
  }
  const tls = url.startsWith("rediss://") ? {} : undefined;
  const r = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false, tls });

  const dbsizeBefore = await r.dbsize();
  console.log("TOTAL KEYS before:", dbsizeBefore);

  const protect = new Set();
  for (const st of ["active", "waiting", "wait", "delayed", "paused"]) {
    const key = `bull:webhook-scoring:${st}`;
    const type = await r.type(key);
    let ids = [];
    if (type === "list") ids = await r.lrange(key, 0, -1);
    else if (type === "zset") ids = await r.zrange(key, 0, -1);
    else if (type === "set") ids = await r.smembers(key);
    ids.forEach((id) => protect.add(`bull:webhook-scoring:${id}`));
  }
  console.log("protected job keys:", protect.size);

  let cursor = "0";
  let deleted = 0;
  let kept = 0;
  let batch = [];
  do {
    const [next, keys] = await r.scan(cursor, "MATCH", "bull:webhook-scoring:webhook_*", "COUNT", 2000);
    cursor = next;
    for (const k of keys) {
      if (protect.has(k)) {
        kept++;
        continue;
      }
      batch.push(k);
      if (batch.length >= 500) {
        await r.del(...batch);
        deleted += batch.length;
        batch = [];
        if (deleted % 50000 === 0) console.log("deleted so far:", deleted);
      }
    }
  } while (cursor !== "0");
  if (batch.length) {
    await r.del(...batch);
    deleted += batch.length;
  }

  const dbsizeAfter = await r.dbsize();
  console.log("DONE. deleted:", deleted, "kept(protected):", kept);
  console.log("TOTAL KEYS after:", dbsizeAfter);
  await r.quit();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
