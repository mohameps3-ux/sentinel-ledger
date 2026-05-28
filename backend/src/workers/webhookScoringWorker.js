"use strict";

const { Worker, Queue } = require("bullmq");
const { getBullmqConnection } = require("../lib/bullmq");
const { WEBHOOK_SCORING_QUEUE_NAME } = require("../queues/webhookScoring.queue");
const { processHeliusWebhookRaw } = require("../services/heliusWebhookProcessor");
const { invalidateSignalsLatestFeedCache } = require("../services/homeTerminalApi");

let workerInstance = null;

async function cleanStalledActiveJobs(connection) {
  try {
    const q = new Queue(WEBHOOK_SCORING_QUEUE_NAME, { connection });
    const STALE_MS = 5 * 60 * 1000;
    const activeJobs = await q.getJobs(["active"], 0, 100);
    const now = Date.now();
    let cleaned = 0;
    for (const job of activeJobs) {
      const age = now - (job.processedOn || job.timestamp || now);
      if (age > STALE_MS) {
        await job.remove().catch(() => {});
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[webhook-worker] cleaned ${cleaned} stalled active zombies on startup`);
    }
    await q.close();
  } catch (e) {
    console.warn("[webhook-worker] zombie cleanup failed (non-fatal):", e?.message);
  }
}

async function startWebhookScoringWorker() {
  if (workerInstance) return workerInstance;
  const connection = getBullmqConnection();
  if (!connection) {
    console.warn("[webhook-worker] skipped: REDIS_URL / UPSTASH_REDIS_URL not configured for BullMQ.");
    return null;
  }

  await cleanStalledActiveJobs(connection);

  workerInstance = new Worker(
    WEBHOOK_SCORING_QUEUE_NAME,
    async (job) => {
      const raw = job.data?.raw;
      const sig = job.data?.signature || "";
      if (!raw || typeof raw !== "object") {
        console.warn("[webhook-worker] missing raw payload jobId=", job.id);
        return null;
      }
      const out = await processHeliusWebhookRaw(raw);
      await invalidateSignalsLatestFeedCache();
      const outcome = out.signalEmitted ? "signal" : out.emitted > 0 ? "emitted" : "idle";
      console.log(
        `[webhook-worker] processed signature=${sig || "unknown"} outcome=${outcome} emitted=${out.emitted} dropped=${out.droppedByGuard}`
      );
      return out;
    },
    {
      connection,
      concurrency: Math.max(1, Math.min(8, Number(process.env.WEBHOOK_WORKER_CONCURRENCY || 2))),
      stalledInterval: 30000,
      maxStalledCount: 2,
      lockDuration: 60000
    }
  );

  workerInstance.on("failed", (job, err) => {
    console.error(
      `[webhook-worker] failed job=${job?.id} sig=${job?.data?.signature || ""}:`,
      err?.message || err
    );
  });

  return workerInstance;
}

module.exports = { startWebhookScoringWorker };
