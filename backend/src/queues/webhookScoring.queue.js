"use strict";

const { Queue } = require("bullmq");
const { getBullmqConnection } = require("../lib/bullmq");

/** Cola BullMQ Fase 3 — ingest webhook asíncrono (nombre cola: webhook-scoring). */
const WEBHOOK_SCORING_QUEUE_NAME = "webhook-scoring";

let webhookScoringQueue = null;

function webhookWorkerEnabled() {
  return String(process.env.FF_WEBHOOK_WORKER || "true").trim().toLowerCase() !== "false";
}

function webhookQueuePriority() {
  const n = Number(process.env.WEBHOOK_QUEUE_PRIORITY ?? 10);
  return Number.isFinite(n) ? n : 10;
}

function getWebhookScoringQueue() {
  if (webhookScoringQueue) return webhookScoringQueue;
  const connection = getBullmqConnection();
  if (!connection) return null;
  webhookScoringQueue = new Queue(WEBHOOK_SCORING_QUEUE_NAME, { connection });
  return webhookScoringQueue;
}

module.exports = {
  WEBHOOK_SCORING_QUEUE_NAME,
  getWebhookScoringQueue,
  webhookWorkerEnabled,
  webhookQueuePriority
};
