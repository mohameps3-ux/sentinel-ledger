/**
 * PRO execution-regime (advisory) for users with pro_alert_prefs.tacticalRegime === true and watchlist mints.
 * Delivers via Telegram and/or Web Push. Paired with services/tacticalRegimeNotify.js (tripleRiskRegime.cjs).
 */
"use strict";

const { randomUUID } = require("crypto");
const { getSupabase } = require("../lib/supabase");
const { resolveProAlertPrefs } = require("../services/proAlertRules");
const { trySendTacticalRegimeTelegram } = require("../services/tacticalRegimeNotify");

const TICK_MS_RAW = Number(process.env.TACTICAL_REGIME_CRON_TICK_MS || 30 * 60 * 1000);
const TICK_MS = Number.isFinite(TICK_MS_RAW) && TICK_MS_RAW >= 5 * 60_000 ? TICK_MS_RAW : 30 * 60 * 1000;
const WATCHLIST_LIMIT = Math.max(5, Math.min(50, Number(process.env.TACTICAL_REGIME_WATCHLIST_LIMIT || 15)));

let intervalRef = null;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastStats = { usersConsidered: 0, mintsChecked: 0, sent: 0, skipped: 0, error: null };

function isEnabled() {
  return String(process.env.TACTICAL_REGIME_CRON_ENABLED || "false").toLowerCase() === "true";
}

async function runTacticalRegimeNotifyTick() {
  const requestId = randomUUID();
  lastStats = { ...lastStats, error: null };
  if (!isEnabled()) return;
  lastTickStartedAt = Date.now();
  let usersConsidered = 0;
  let mintsChecked = 0;
  let sent = 0;
  let skipped = 0;

  try {
    const supabase = getSupabase();
    const { data: users, error } = await supabase
      .from("users")
      .select("id, telegram_chat_id, pro_alerts_enabled, pro_alert_prefs")
      .eq("pro_alerts_enabled", true);
    if (error) {
      lastStats = { usersConsidered: 0, mintsChecked: 0, sent: 0, skipped: 0, error: error.message };
      return;
    }

    const { data: pushRows } = await supabase.from("web_push_subscriptions").select("user_id");
    const pushUserIds = new Set((pushRows || []).map((r) => r.user_id).filter(Boolean));

    for (const u of users || []) {
      const prefs = resolveProAlertPrefs(u.pro_alert_prefs);
      if (!prefs.tacticalRegime) {
        skipped += 1;
        continue;
      }
      const hasTg = Boolean(u.telegram_chat_id);
      if (!hasTg && !pushUserIds.has(u.id)) {
        skipped += 1;
        continue;
      }
      usersConsidered += 1;
      const { data: rows } = await supabase
        .from("watchlists")
        .select("token_address")
        .eq("user_id", u.id)
        .limit(WATCHLIST_LIMIT);
      for (const row of rows || []) {
        const mint = row?.token_address;
        if (!mint) continue;
        mintsChecked += 1;
        const out = await trySendTacticalRegimeTelegram({
          userId: u.id,
          chatId: u.telegram_chat_id || "",
          mint
        });
        if (out.ok) sent += 1;
      }
    }
    lastStats = { usersConsidered, mintsChecked, sent, skipped, error: null };
  } catch (e) {
    lastStats = { ...lastStats, error: e?.message || String(e) };
    console.warn(`[tactical-regime-cron][${requestId}]`, e?.message || e);
  } finally {
    lastTickFinishedAt = Date.now();
    console.log(`[tactical-regime-cron][${requestId}] tick`, lastStats);
  }
}

function getTacticalRegimeNotifyCronStatus() {
  return {
    tickIntervalMs: TICK_MS,
    enabled: isEnabled(),
    lastTickStartedAt,
    lastTickFinishedAt,
    lastStats
  };
}

function startTacticalRegimeNotifyCron() {
  if (intervalRef) return;
  if (!isEnabled()) {
    console.log("Tactical regime notify cron: disabled (TACTICAL_REGIME_CRON_ENABLED not true). Ops preview still works.");
    return;
  }
  runTacticalRegimeNotifyTick().catch((e) => console.warn("tactical-regime bootstrap:", e?.message));
  intervalRef = setInterval(() => {
    runTacticalRegimeNotifyTick().catch((e) => console.warn("tactical-regime tick:", e?.message));
  }, TICK_MS);
}

module.exports = {
  startTacticalRegimeNotifyCron,
  getTacticalRegimeNotifyCronStatus,
  runTacticalRegimeNotifyTick
};
