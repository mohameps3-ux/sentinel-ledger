"use strict";

/**
 * Fase 2 — Cola de scoring / ingest (placeholder).
 *
 * Hoy el webhook Helius se procesa en línea (`routes/heliusWebhook.js`) y marca
 * actividad con `recordWebhookIngestActivity` (`lib/eventPriority.js`).
 *
 * Cuando exista una cola BullMQ dedicada al webhook (p. ej. `webhook-scoring`),
 * encolar con `BULLMQ_PRIORITY_WEBHOOK_INGEST`; los jobs de cron/backfill
 * deben usar `BULLMQ_PRIORITY_LOW` para que BullMQ los atienda después.
 *
 * @see ../lib/eventPriority.js
 * @see ../workers/smartWallet.worker.js
 */
const {
  BULLMQ_PRIORITY_LOW,
  BULLMQ_PRIORITY_WEBHOOK_INGEST
} = require("../lib/eventPriority");

module.exports = {
  BULLMQ_PRIORITY_LOW,
  BULLMQ_PRIORITY_WEBHOOK_INGEST
};
