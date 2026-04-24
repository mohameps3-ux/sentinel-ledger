const express = require("express");
const { getSupabase } = require("../lib/supabase");
const { authMiddleware, requirePro } = require("./auth");
const { verifyTelegramLoginWidget } = require("../services/telegramWidgetAuth");
const { resolveProAlertPrefs, STRATEGY } = require("../services/proAlertRules");

const router = express.Router();

function countOrZero(n) {
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

router.get("/settings", authMiddleware, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: row, error } = await supabase
      .from("users")
      .select("telegram_chat_id, pro_alerts_enabled, pro_alert_prefs")
      .eq("id", req.user.userId)
      .maybeSingle();

    if (error) throw error;

    const chat = row?.telegram_chat_id ? String(row.telegram_chat_id) : null;
    const resolved = resolveProAlertPrefs(row?.pro_alert_prefs);
    const { count: pushCount } = await supabase
      .from("web_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.user.userId);

    return res.json({
      ok: true,
      data: {
        linked: Boolean(chat),
        enabled: Boolean(row?.pro_alerts_enabled),
        chatHint: chat ? `${chat.slice(0, 2)}…${chat.slice(-2)}` : null,
        browserPushCount: countOrZero(pushCount),
        prefs: resolved,
        strategies: Object.keys(STRATEGY)
      }
    });
  } catch (error) {
    console.error("alerts/settings:", error);
    return res.status(500).json({ ok: false, error: "settings_failed" });
  }
});

router.patch("/settings", authMiddleware, requirePro, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: current, error: fetchErr } = await supabase
      .from("users")
      .select("telegram_chat_id, pro_alerts_enabled, pro_alert_prefs")
      .eq("id", req.user.userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    const nextPrefs = { ...(current?.pro_alert_prefs || {}) };

    if (typeof req.body?.enabled === "boolean") {
      // handled below
    }
    if (typeof req.body?.strategy === "string" && STRATEGY[req.body.strategy]) {
      nextPrefs.strategy = req.body.strategy;
    }
    if (typeof req.body?.direction === "string" && ["any", "up", "down"].includes(req.body.direction)) {
      nextPrefs.direction = req.body.direction;
    }
    if (req.body?.minMovePct != null) {
      const n = Number(req.body.minMovePct);
      if (Number.isFinite(n)) nextPrefs.minMovePct = Math.min(25, Math.max(2, n));
    }
    if (req.body?.dedupHours != null) {
      const n = Number(req.body.dedupHours);
      if (Number.isFinite(n)) nextPrefs.dedupHours = Math.min(24, Math.max(1, n));
    }
    if (typeof req.body?.tacticalRegime === "boolean") {
      nextPrefs.tacticalRegime = req.body.tacticalRegime;
    }

    const updatePayload = {
      pro_alert_prefs: nextPrefs
    };

    if (typeof req.body?.enabled === "boolean") {
      updatePayload.pro_alerts_enabled = req.body.enabled;
    }

    const { data: row, error } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", req.user.userId)
      .select("telegram_chat_id, pro_alerts_enabled, pro_alert_prefs")
      .maybeSingle();

    if (error) throw error;
    if (row?.pro_alerts_enabled && !row?.telegram_chat_id) {
      const { count, error: cErr } = await supabase
        .from("web_push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", req.user.userId);
      if (cErr) throw cErr;
      if (!countOrZero(count)) {
        return res.status(400).json({ ok: false, error: "delivery_channel_required" });
      }
    }

    const resolved = resolveProAlertPrefs(row?.pro_alert_prefs);

    return res.json({
      ok: true,
      data: {
        enabled: Boolean(row?.pro_alerts_enabled),
        prefs: resolved
      }
    });
  } catch (error) {
    console.error("alerts/settings patch:", error);
    return res.status(500).json({ ok: false, error: "settings_update_failed" });
  }
});

router.post("/telegram/auth", authMiddleware, requirePro, async (req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(503).json({ ok: false, error: "telegram_not_configured" });

    const verified = verifyTelegramLoginWidget(req.body, botToken);
    if (!verified.ok) {
      return res.status(400).json({ ok: false, error: verified.reason || "verification_failed" });
    }

    const supabase = getSupabase();
    const { data: cur } = await supabase
      .from("users")
      .select("pro_alert_prefs")
      .eq("id", req.user.userId)
      .maybeSingle();

    const mergedPrefs = { ...(cur?.pro_alert_prefs || {}), strategy: cur?.pro_alert_prefs?.strategy || "balanced" };

    const { data, error } = await supabase
      .from("users")
      .update({
        telegram_chat_id: verified.telegramUserId,
        pro_alerts_enabled: true,
        pro_alert_prefs: mergedPrefs
      })
      .eq("id", req.user.userId)
      .select("telegram_chat_id, pro_alerts_enabled, pro_alert_prefs")
      .single();

    if (error) throw error;

    return res.json({
      ok: true,
      data: {
        linked: true,
        enabled: Boolean(data?.pro_alerts_enabled),
        prefs: resolveProAlertPrefs(data?.pro_alert_prefs)
      }
    });
  } catch (error) {
    console.error("alerts/telegram/auth:", error);
    return res.status(500).json({ ok: false, error: "link_failed" });
  }
});

module.exports = router;
