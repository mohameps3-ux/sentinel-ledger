"use strict";

const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const supportTree = require("../data/support-tree.json");

// ── GLOBAL NOISE WORDS ───────────────────────────────────────
const GLOBAL_NOISE = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "en",
  "con",
  "por",
  "para",
  "que",
  "es",
  "son",
  "hay",
  "como",
  "donde",
  "cuando",
  "cual",
  "me",
  "te",
  "se",
  "nos",
  "le",
  "lo",
  "al",
  "yo",
  "tu",
  "si",
  "no",
  "mi",
  "su",
  "mas",
  "pero",
  "y",
  "o",
  "a",
  "e"
]);

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

// ── NORMALIZER (Unicode letter/number; preserves ñ, ä, etc.) ─
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim();
}

function extractTokens(text, filterNoise = true) {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .filter((t) => !filterNoise || !GLOBAL_NOISE.has(t));
}

// ── FIX 3: normalize core_tokens before scoring ─────────────
function normalizeTokenList(tokens) {
  return (tokens || []).map((t) => normalize(t));
}

// ── JACCARD WITH NOISE FILTERING ────────────────────────────
function jaccardScore(tokensA, tokensB) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── PHRASE BOOST ────────────────────────────────────────────
function phraseBoost(message, phrases) {
  const msg = normalize(message);
  let boost = 0;
  for (const phrase of phrases || []) {
    if (msg.includes(normalize(phrase))) {
      boost += 0.25;
    }
  }
  return Math.min(boost, 0.5);
}

// ── MAIN SCORER ─────────────────────────────────────────────
function scoreIntent(message) {
  const msgTokens = extractTokens(message, true);
  let best = null;
  let bestScore = 0;

  for (const [key, entry] of Object.entries(supportTree)) {
    if (!entry) continue;
    // FIX 3: normalize core_tokens before Jaccard
    const core = normalizeTokenList(entry.core_tokens || []);
    const jaccard = jaccardScore(msgTokens, core);
    const boost = phraseBoost(message, entry.phrases || []);
    const finalScore = (jaccard + boost) * (entry.confidence || 0.9);

    if (finalScore > bestScore) {
      bestScore = finalScore;
      best = { key, entry, score: finalScore, jaccard, boost };
    }
  }

  let confidenceLevel;
  if (bestScore >= 0.2) confidenceLevel = "HIGH";
  else if (bestScore >= 0.08) confidenceLevel = "MEDIUM";
  else confidenceLevel = "LOW";

  return { best, score: bestScore, confidenceLevel };
}

// ── TOKEN SIGNATURE for semantic dedup ──────────────────────
function tokenSignature(message, intentId) {
  const tokens = extractTokens(message, true).sort().slice(0, 5);
  return `${intentId}:${tokens.join("_")}`;
}

// ── HASH ─────────────────────────────────────────────────────
function hashQuestion(question) {
  return crypto
    .createHash("sha256")
    .update(String(question).toLowerCase().trim(), "utf8")
    .digest("hex")
    .substring(0, 16);
}

// ── CONTEXT PACK ─────────────────────────────────────────────
async function buildContextPack() {
  const supabase = safeSupabase();
  if (!supabase) {
    return {
      recentSignals: [],
      topWallets: [],
      gateEmitRate: "N/A",
      signal_count: 0,
      wallet_count: 66,
      regime: "normal",
      timestamp: new Date().toISOString()
    };
  }
  try {
    const [signalsRes, walletsRes, rulesRes] = await Promise.all([
      supabase
        .from("smart_wallet_signals")
        .select("token_address, result_pct, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("smart_wallets")
        .select("wallet_address, win_rate, smart_score")
        .order("smart_score", { ascending: false })
        .limit(5),
      supabase
        .from("rule_performance")
        .select("rule_id, confidence_score, total_signals, success_count_60m")
        .order("confidence_score", { ascending: false })
        .limit(3)
    ]);

    const rules = rulesRes.data || [];
    const totalEmitted = rules.reduce((a, r) => a + (r.success_count_60m || 0), 0);
    const totalDecisions = rules.reduce((a, r) => a + (r.total_signals || 1), 0);
    const emitRate = totalDecisions > 0 ? ((totalEmitted / totalDecisions) * 100).toFixed(1) + "%" : "0.3%";

    return {
      recentSignals: signalsRes.data || [],
      topWallets: walletsRes.data || [],
      gateEmitRate: emitRate,
      signal_count: (signalsRes.data || []).length,
      wallet_count: (walletsRes.data || []).length || 66,
      regime: "normal",
      timestamp: new Date().toISOString()
    };
  } catch {
    return {
      recentSignals: [],
      topWallets: [],
      gateEmitRate: "N/A",
      signal_count: 0,
      wallet_count: 66,
      regime: "normal",
      timestamp: new Date().toISOString()
    };
  }
}

// ── TEMPLATE FILLER ──────────────────────────────────────────
function fillTemplate(template, ctx) {
  return String(template || "")
    .replace("{emit_rate}", ctx.gateEmitRate || "N/A")
    .replace("{regime}", ctx.regime || "normal")
    .replace("{wallet_count}", String(ctx.wallet_count != null ? ctx.wallet_count : 66))
    .replace("{signal_count}", String(ctx.signal_count != null ? ctx.signal_count : "0"))
    .replace(
      "{freshness}",
      typeof ctx.freshness === "string" ? ctx.freshness : new Date().toLocaleTimeString("es-ES")
    );
}

// ── SIGMOID for feedback normalization ───────────────────────
function sigmoidScore(row) {
  if (!row) return 0;
  const up = Number(row.thumbs_up || 0);
  const down = Number(row.thumbs_down || 0);
  const used = Number(row.times_used || 0);
  const raw = up - down * 2 + used * 0.05;
  return 1 / (1 + Math.exp(-raw * 0.1));
}

// ── MAIN HANDLER ─────────────────────────────────────────────
async function handleBotMessage(message, language = "es", _sessionId) {
  const supabase = safeSupabase();
  const hash = hashQuestion(message);
  const { best, confidenceLevel } = scoreIntent(message);

  // ── HIGH: support tree ─────────────────────────────────────
  if (confidenceLevel === "HIGH" && best) {
    const ctx = await buildContextPack();
    const answer = fillTemplate(best.entry.response_template, ctx);
    const sig = tokenSignature(message, best.entry.intent_id);

    if (!supabase) {
      return {
        answer,
        intent: best.entry.intent_id,
        source: "support",
        cached: false,
        confidence_level: "HIGH",
        thumbsId: null
      };
    }

    const { data: saved, error: upErr } = await supabase
      .from("bot_memory")
      .upsert(
        {
          question_hash: hash,
          question_sample: String(message).substring(0, 200),
          intent: String(best.entry.intent_id).slice(0, 20),
          answer_type: "support",
          best_answer: answer,
          source: "docs",
          confidence: Math.min(Number(best.score) || 0, 1.0),
          language: String(language).slice(0, 5),
          token_signature: String(sig).slice(0, 200),
          updated_at: new Date().toISOString()
        },
        { onConflict: "question_hash" }
      )
      .select("id")
      .maybeSingle();
    if (upErr) {
      console.warn("[bot] upsert HIGH", upErr.message);
    }

    return {
      answer,
      intent: best.entry.intent_id,
      source: "support",
      cached: false,
      confidence_level: "HIGH",
      thumbsId: saved?.id || null
    };
  }

  // ── MEDIUM: deterministic 3-step ──────────────────────────
  if (confidenceLevel === "MEDIUM") {
    if (supabase) {
      const { data: cached, error: cErr } = await supabase
        .from("bot_memory")
        .select("*")
        .eq("question_hash", hash)
        .gt("confidence", 0.4)
        .maybeSingle();

      if (!cErr && cached && sigmoidScore(cached) > 0.4) {
        await supabase
          .from("bot_memory")
          .update({
            times_used: Number(cached.times_used || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq("id", cached.id);

        return {
          answer: cached.best_answer,
          intent: cached.intent,
          source: "memory",
          cached: true,
          confidence_level: "MEDIUM",
          thumbsId: cached.id
        };
      }
    }

    if (best) {
      const ctx = await buildContextPack();
      const answer = fillTemplate(best.entry.response_template, ctx);
      return {
        answer,
        intent: best.entry.intent_id,
        source: "support_partial",
        cached: false,
        confidence_level: "MEDIUM",
        thumbsId: null
      };
    }

    const ctx = await buildContextPack();
    return {
      answer:
        language === "en"
          ? `Sentinel monitors ${ctx.wallet_count} wallets with ${ctx.signal_count} recent signals. Ask me about: signals, score, wallets, PRO plans, or Telegram. This is not financial advice.`
          : `Sentinel monitorea ${ctx.wallet_count} wallets con ${ctx.signal_count} señales recientes. Pregúntame sobre: señales, score, wallets, planes PRO o Telegram. This is not financial advice.`,
      intent: "GENERAL",
      source: "sentinel",
      cached: false,
      confidence_level: "MEDIUM",
      thumbsId: null
    };
  }

  // ── LOW: structured fallback, never empty ─────────────────
  const ctx = await buildContextPack();
  const topics =
    language === "en"
      ? "› Signals  › Score  › Wallets  › Telegram  › PRO plans  › Track Record"
      : "› Señales  › Score  › Wallets  › Telegram  › Planes PRO  › Track Record";

  return {
    answer:
      language === "en"
        ? `I can help you with:\n${topics}\n\nSentinel monitors ${ctx.wallet_count} wallets. What do you need? This is not financial advice.`
        : `Puedo ayudarte con:\n${topics}\n\nSentinel monitorea ${ctx.wallet_count} wallets. ¿Qué necesitas? This is not financial advice.`,
    intent: "UNKNOWN",
    source: "fallback",
    cached: false,
    confidence_level: "LOW",
    thumbsId: null
  };
}

// ── FEEDBACK with capped delta + sigmoid ─────────────────────
async function handleFeedback(thumbsId, vote) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false };

  const { data: entry, error } = await supabase.from("bot_memory").select("*").eq("id", thumbsId).maybeSingle();
  if (error || !entry) return { ok: false };

  const MAX_DELTA = 0.05;

  if (vote === "up") {
    await supabase
      .from("bot_memory")
      .update({
        thumbs_up: Number(entry.thumbs_up || 0) + 1,
        confidence: Math.min(Number(entry.confidence || 0) + MAX_DELTA, 1.0),
        updated_at: new Date().toISOString()
      })
      .eq("id", thumbsId);
  } else {
    const newDown = Number(entry.thumbs_down || 0) + 1;
    await supabase
      .from("bot_memory")
      .update({
        thumbs_down: newDown,
        confidence: newDown > 5 ? 0 : Math.max(Number(entry.confidence || 0) - MAX_DELTA, 0),
        updated_at: new Date().toISOString()
      })
      .eq("id", thumbsId);
  }
  return { ok: true };
}

function classifyIntent(message) {
  const { best, confidenceLevel } = scoreIntent(message);
  if (confidenceLevel === "LOW") return "GENERAL";
  return best?.entry?.intent_id || "GENERAL";
}

module.exports = { handleBotMessage, handleFeedback, classifyIntent };
