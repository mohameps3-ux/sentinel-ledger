"use strict";

/**
 * Fase 2 stub — prioridades BullMQ.
 * Fase 3: el consumidor real es `webhookScoringWorker.js` (cola `webhook-scoring`).
 */
const {
  BULLMQ_PRIORITY_LOW,
  BULLMQ_PRIORITY_WEBHOOK_INGEST
} = require("../lib/eventPriority");

module.exports = {
  BULLMQ_PRIORITY_LOW,
  BULLMQ_PRIORITY_WEBHOOK_INGEST
};
