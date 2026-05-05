"use strict";

/**
 * Fase 2 — Event Priority Engine: webhook > poller > backfill.
 * Usa Redis `last_event_ts:global` actualizado por Helius webhook (ingesta válida).
 * Desactivar con FF_PRIORITY_ENGINE=false (rollback).
 */

const redis = require("./cache");

const LAST_EVENT_TS_KEY = "last_event_ts:global";
const POLLER_FORCE_MODE_KEY = "poller_force_mode";

function priorityEngineEnabled() {
  return String(process.env.FF_PRIORITY_ENGINE || "true").trim().toLowerCase() !== "false";
}

function pollerSkipMinutes() {
  const raw = Number(process.env.POLLER_SKIP_MINUTES ?? 2);
  if (!Number.isFinite(raw) || raw < 0) return 2;
  return Math.min(120, raw);
}

function backfillQuietMinutes() {
  const raw = Number(process.env.BACKFILL_WEBHOOK_QUIET_MINUTES ?? 5);
  if (!Number.isFinite(raw) || raw < 0) return 5;
  return Math.min(120, raw);
}

function fallbackPollerTriggerMinutes() {
  const raw = Number(process.env.FALLBACK_POLLER_TRIGGER_MINUTES ?? 5);
  if (!Number.isFinite(raw) || raw <= 0) return 5;
  return Math.min(120, raw);
}

async function isPollerForceModeActive() {
  try {
    const v = await redis.get(POLLER_FORCE_MODE_KEY);
    return v != null && v !== "";
  } catch {
    return false;
  }
}

/** BullMQ: mayor número = mayor prioridad (procesado antes). */
const BULLMQ_PRIORITY_LOW = 1;
const BULLMQ_PRIORITY_WEBHOOK_INGEST = 10;

async function recordWebhookIngestActivity() {
  if (!priorityEngineEnabled()) return;
  try {
    const ts = Date.now();
    await redis.set(LAST_EVENT_TS_KEY, String(ts), { ex: 7 * 24 * 3600 });
  } catch (e) {
    console.warn("[event-priority] recordWebhookIngestActivity:", e?.message || e);
  }
}

async function getLastWebhookActivityMs() {
  try {
    const v = await redis.get(LAST_EVENT_TS_KEY);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function shouldSkipPollerForRecentWebhook() {
  if (!priorityEngineEnabled()) return false;
  const ms = await getLastWebhookActivityMs();
  if (ms == null) return false;
  const windowMs = pollerSkipMinutes() * 60 * 1000;
  if (windowMs <= 0) return false;
  return Date.now() - ms < windowMs;
}

async function shouldDeferBackfillForRecentWebhook() {
  if (!priorityEngineEnabled()) return false;
  const ms = await getLastWebhookActivityMs();
  if (ms == null) return false;
  const windowMs = backfillQuietMinutes() * 60 * 1000;
  if (windowMs <= 0) return false;
  return Date.now() - ms < windowMs;
}

module.exports = {
  LAST_EVENT_TS_KEY,
  POLLER_FORCE_MODE_KEY,
  priorityEngineEnabled,
  recordWebhookIngestActivity,
  getLastWebhookActivityMs,
  shouldSkipPollerForRecentWebhook,
  shouldDeferBackfillForRecentWebhook,
  pollerSkipMinutes,
  backfillQuietMinutes,
  fallbackPollerTriggerMinutes,
  isPollerForceModeActive,
  BULLMQ_PRIORITY_LOW,
  BULLMQ_PRIORITY_WEBHOOK_INGEST
};
