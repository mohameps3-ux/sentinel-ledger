"use strict";

const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const redis = require("../lib/cache");
const { getSignalGateOpsSnapshot } = require("./signalEmissionGate");
const {
  getLatestSignalsFeedCached,
  getSmartWalletsTopCached,
  capSignalsLatestLimit
} = require("./homeTerminalApi");

const supportTree = require("../data/support-tree.json");

const RE_ACTION = /\b(alertas|watchlist|configurar|activar)\b|watchlist|alertas/i;
const RE_ANALYTICS = /precio|price|token|score|señal|signal|chain|blockchain|pump|raydium/i;
const RE_SUPPORT =
  /error|problema|fallo|no funciona|no veo|pagar|suscripci|subscription|ayuda|help|wallet|phantom|conectar|connect|\bpro\b|upgrade/i;

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

function hashQuestion(message) {
  const n = String(message || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(n, "utf8").digest("hex").slice(0, 16);
}

function classifyIntent(message) {
  const t = String(message || "");
  if (RE_ACTION.test(t)) return "ACTION";
  if (RE_ANALYTICS.test(t)) return "ANALYTICS";
  if (RE_SUPPORT.test(t)) return "SUPPORT";
  return "GENERAL";
}

function findSupportTreeAnswer(normalized) {
  const n = String(normalized || "").toLowerCase();
  for (const [key, def] of Object.entries(supportTree)) {
    const kws = Array.isArray(def.keywords) ? def.keywords : [];
    for (const kw of kws) {
      const k = String(kw).toLowerCase();
      if (k.length < 4) {
        if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(n)) {
          return { id: key, answer: def.answer };
        }
      } else if (n.includes(k)) {
        return { id: key, answer: def.answer };
      }
    }
  }
  return null;
}

async function getBotSystemHealth() {
  let cache = null;
  try {
    await redis.set("health:ping", "1", { ex: 10 });
    cache = (await redis.get("health:ping")) != null;
  } catch {
    cache = false;
  }
  return {
    service: "sentinel-ledger-backend",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || null,
    cache
  };
}

async function buildAnalyticsContextPack() {
  const supabase = safeSupabase();
  const systemHealth = await getBotSystemHealth();
  const gate = getSignalGateOpsSnapshot();
  const regime = gate?.regime || {};
  const stats = gate?.stats || {};

  let recentSignals = null;
  let topWallets = null;
  let opsWinHint = null;

  if (supabase) {
    try {
      const lim = capSignalsLatestLimit(3);
      const feed = await getLatestSignalsFeedCached(supabase, lim, "balanced");
      const rows = Array.isArray(feed?.data) ? feed.data : [];
      recentSignals = rows.slice(0, 3).map((r) => ({
        token: r?.token || r?.symbol || "—",
        tokenAddress: r?.tokenAddress,
        decision: r?.decision,
        score: r?.score ?? r?.sentinelScore
      }));
    } catch (e) {
      recentSignals = { error: e?.message || "signals_unavailable" };
    }
    try {
      const top = await getSmartWalletsTopCached(supabase, 3);
      const data = top?.data ?? top?.rows;
      const list = Array.isArray(data) ? data : [];
      topWallets = list.slice(0, 3).map((w) => ({
        wallet: w?.walletAddress || w?.address || w?.wallet,
        winRate: w?.winRate ?? w?.win_rate,
        pnl30d: w?.pnl30d ?? w?.pnl_30d
      }));
    } catch (e) {
      topWallets = { error: e?.message || "leaderboard_unavailable" };
    }
    try {
      const { data: rules, error: rErr } = await supabase
        .from("signal_performance")
        .select("total_signals, success_count_60m")
        .limit(200);
      if (!rErr && Array.isArray(rules) && rules.length) {
        const tot = rules.reduce((s, r) => s + Number(r?.total_signals || 0), 0);
        const wins = rules.reduce((s, r) => s + Number(r?.success_count_60m || 0), 0);
        opsWinHint = tot > 0 ? { aggregateWinRate60m: Number((wins / tot).toFixed(4)), sampleSignals: tot } : null;
      }
    } catch {
      opsWinHint = null;
    }
  }

  return {
    systemHealth,
    signalGate: {
      emitRate: stats.emitRate,
      decisions: stats.decisions,
      emitted: stats.emitted,
      blocked: stats.blocked,
      regimeEnabled: Boolean(regime?.enabled),
      byRegime: regime?.byRegime || {}
    },
    recentSignals,
    topWallets,
    opsData: { winRateFromRules: opsWinHint }
  };
}

function buildSystemPrompt(language, contextPack) {
  const es = !language || String(language).toLowerCase().startsWith("es");
  const ctx = JSON.stringify(contextPack, null, 0);
  if (es) {
    return `Eres el asistente de Sentinel Ledger (terminal de señales y smart money en Solana). 
Responde en español, de forma breve y clara (4-8 oraciones o viñetas).
Usa SOLO el contexto JSON (context_pack) y conocimiento de producto; no inventes cifras que no vengan del contexto.
Prohibido garantizar retornos o dar asesoramiento financiero personalizado. El producto hace análisis y señales, no asesoría de inversión.
context_pack: ${ctx}`;
  }
  return `You are Sentinel Ledger's in-app assistant (Solana smart-money / signals terminal).
Reply in English, concisely, using only the following JSON context and public product knowledge; do not fabricate numbers.
Do not provide personalized financial advice or guaranteed returns.
context_pack: ${ctx}`;
}

async function callClaudeModel({ system, userMessage, language }) {
  const key = String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) {
    const es = !language || String(language).toLowerCase().startsWith("es");
    return {
      text: es
        ? "El asistente analítico requiere ANTHROPIC_API_KEY en el servidor. Contacta al administrador."
        : "The analytics assistant requires ANTHROPIC_API_KEY on the server.",
      model: null
    };
  }
  const model =
    String(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514").trim() || "claude-sonnet-4-20250514";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      system,
      messages: [{ role: "user", content: userMessage.slice(0, 4000) }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    console.warn("[bot] Claude API error", res.status, errText.slice(0, 220));
    const es = !language || String(language).toLowerCase().startsWith("es");
    return {
      text: es
        ? "No se pudo generar la respuesta ahora. Inténtalo de nuevo en unos segundos."
        : "Could not generate a response. Please try again shortly.",
      model: null
    };
  }
  const data = await res.json();
  const text = (data?.content || []).find((b) => b.type === "text")?.text || "";
  return { text: String(text).trim() || "—", model };
}

function sanitizeIncomingMessage(message) {
  if (message == null) return { ok: false, error: "message_required" };
  const s = String(message).replace(/\u0000/g, "").trim();
  if (s.length < 1) return { ok: false, error: "message_empty" };
  if (s.length > 2000) return { ok: false, error: "message_too_long" };
  if (/<\s*script/i.test(s)) return { ok: false, error: "message_rejected" };
  return { ok: true, value: s };
}

async function insertMemoryRow({
  questionHash,
  questionSample,
  intent,
  answer,
  source,
  answerType,
  language,
  confidence
}) {
  const supabase = safeSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("bot_memory")
    .insert({
      question_hash: questionHash,
      question_sample: questionSample.slice(0, 500),
      intent,
      answer_type: answerType,
      best_answer: answer,
      source,
      language: (language || "es").slice(0, 5),
      confidence,
      times_used: 0,
      updated_at: new Date().toISOString()
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[bot] insert bot_memory failed:", error.message);
    return null;
  }
  return data?.id || null;
}

function useFullAnalyticsContext(intent, uiMode) {
  if (uiMode === "ask") return true;
  if (uiMode === "support") return false;
  return intent === "ANALYTICS" || intent === "GENERAL";
}

async function processBotMessage({ message, language, sessionId: _sessionId, uiMode = "auto" }) {
  const v = sanitizeIncomingMessage(message);
  if (!v.ok) {
    return { ok: false, error: v.error, status: 400 };
  }
  const text = v.value;
  const lang = (language || "es").slice(0, 5);
  const h = hashQuestion(text);
  const intent = classifyIntent(text);
  const supabase = safeSupabase();

  if (supabase) {
    const { data: cached, error: cErr } = await supabase
      .from("bot_memory")
      .select("id, best_answer, intent, source, confidence, times_used, thumbs_up, thumbs_down")
      .eq("question_hash", h)
      .gt("confidence", 0.7)
      .limit(1)
      .maybeSingle();
    if (!cErr && cached && cached.id) {
      const next = Number(cached.times_used || 0) + 1;
      await supabase.from("bot_memory").update({ times_used: next, updated_at: new Date().toISOString() }).eq("id", cached.id);
      return {
        ok: true,
        answer: cached.best_answer,
        intent: cached.intent || intent,
        source: "cache",
        cached: true,
        thumbsId: cached.id
      };
    }
  }

  const supportHit = findSupportTreeAnswer(text);
  if (supportHit) {
    const id = await insertMemoryRow({
      questionHash: h,
      questionSample: text,
      intent,
      answer: supportHit.answer,
      source: "docs",
      answerType: "manual",
      language: lang,
      confidence: 0.85
    });
    return {
      ok: true,
      answer: supportHit.answer,
      intent,
      source: "docs",
      cached: false,
      thumbsId: id
    };
  }

  const fullCtx = useFullAnalyticsContext(intent, uiMode);

  if (!fullCtx) {
    const contextPack = { light: true, intent, uiMode, systemHealth: await getBotSystemHealth() };
    const sys = buildSystemPrompt(lang, contextPack);
    const { text: ans } = await callClaudeModel({
      system: sys,
      userMessage: `Pregunta del usuario: ${text}`,
      language: lang
    });
    const id = await insertMemoryRow({
      questionHash: h,
      questionSample: text,
      intent,
      answer: ans,
      source: "llm",
      answerType: "llm",
      language: lang,
      confidence: 0.5
    });
    return { ok: true, answer: ans, intent, source: "llm", cached: false, thumbsId: id };
  }

  const contextPack = await buildAnalyticsContextPack();
  const system = buildSystemPrompt(lang, contextPack);
  const { text: ans } = await callClaudeModel({
    system,
    userMessage: `Pregunta del usuario: ${text}`,
    language: lang
  });
  const id = await insertMemoryRow({
    questionHash: h,
    questionSample: text,
    intent,
    answer: ans,
    source: "llm",
    answerType: "llm",
    language: lang,
    confidence: 0.5
  });
  return { ok: true, answer: ans, intent, source: "llm", cached: false, thumbsId: id };
}

async function applyBotFeedback({ thumbsId, vote }) {
  const supabase = safeSupabase();
  if (!supabase) {
    return { ok: false, error: "supabase_unconfigured", status: 503 };
  }
  const { data: row, error } = await supabase
    .from("bot_memory")
    .select("id, confidence, thumbs_up, thumbs_down")
    .eq("id", thumbsId)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, error: "not_found", status: 404 };
  }
  let confidence = Number(row.confidence || 0.5);
  let thumbsUp = Number(row.thumbs_up || 0);
  let thumbsDown = Number(row.thumbs_down || 0);
  if (vote === "up") {
    confidence = Math.min(1, confidence + 0.1);
    thumbsUp += 1;
  } else {
    thumbsDown += 1;
    if (thumbsDown > 3) confidence = 0;
  }
  const { error: uErr } = await supabase
    .from("bot_memory")
    .update({
      confidence,
      thumbs_up: thumbsUp,
      thumbs_down: thumbsDown,
      updated_at: new Date().toISOString()
    })
    .eq("id", thumbsId);
  if (uErr) {
    return { ok: false, error: uErr.message, status: 500 };
  }
  return { ok: true, confidence, thumbsUp, thumbsDown };
}

module.exports = {
  hashQuestion,
  classifyIntent,
  buildAnalyticsContextPack,
  processBotMessage,
  applyBotFeedback,
  findSupportTreeAnswer
};
