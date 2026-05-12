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

function openaiBotModel() {
  return (
    process.env.OPENAI_BOT_MODEL ||
    process.env.OPENAI_SENTINEL_AGENT_MODEL ||
    "gpt-4o-mini"
  );
}

async function callOpenAIChatCompletion({ system, user, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = openaiBotModel();
  const reasoningish = /^(o\d|gpt-5)/i.test(model);
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: String(user) }
    ],
    ...(reasoningish || String(process.env.OPENAI_BOT_USE_MAX_COMPLETION_TOKENS || "") === "1"
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens })
  };
  if (!reasoningish) {
    payload.temperature = 0.3;
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      console.error("[bot] OpenAI error:", data.error || response.status);
      return null;
    }
    const text = data.choices?.[0]?.message?.content?.trim();
    return typeof text === "string" && text ? text : null;
  } catch (err) {
    console.error("[bot] OpenAI fetch error:", err.message);
    return null;
  }
}

async function callClaudeAPI(question, intent, contextPack, language) {
  const systemPrompt = `You are Sentinel Assistant, the AI for Sentinel Ledger — a Solana on-chain intelligence terminal.

RULES:
- Answer in ${language === "en" ? "English" : "Spanish"}
- Be concise and technical
- Never give financial advice
- Add "This is not financial advice" at the end
- Use context data if available

SENTINEL CONTEXT:
${JSON.stringify(contextPack, null, 2)}

SENTINEL FEATURES:
- Live signal feed with Sentinel Score (0-100)
- Smart Money leaderboard (66+ verified wallets)
- Validation Oracle (validates signals at 5/15/60 min)
- Auto-Discovery (finds new smart wallets)
- Telegram: @sentinelledger_intel_bot
- Track Record: /graveyard`;

  return callOpenAIChatCompletion({
    system: systemPrompt,
    user: String(question),
    maxTokens: 300
  });
}

function normalizeMode(mode) {
  const m = String(mode || "").toLowerCase().trim();
  if (m === "diagnostic" || m === "operator" || m === "chat") return m;
  return "chat";
}

function isGreeting(message) {
  const msg = normalize(message);
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|que tal|como estas|hey|hi)\b/.test(msg);
}

function isOperatorConfirmation(message) {
  const msg = normalize(message);
  return /\b(ok|vale|confirmo|confirmado|si|sí|adelante|ejecuta|hazlo)\b/.test(msg);
}

function buildOperatorConfirmationReply(language) {
  if (language === "en") {
    return "Understood. I will stay in operator planning mode. I will not execute changes, commit, push, or deploy until you explicitly confirm with: `OK ejecutar`.";
  }
  return "Entendido. Me quedo en modo operador-plan. No ejecutaré cambios, commit, push ni deploy hasta que confirmes explícitamente con: `OK ejecutar`.";
}

function buildChatSystemPrompt(contextPack, language) {
  return `You are Sentinel Copilot.

DEFAULT BEHAVIOR:
- Reply in ${language === "en" ? "English" : "Spanish"}.
- Natural, friendly, concise conversation style.
- If user greets, greet back naturally.
- Do NOT force diagnostics, scoring, gate metrics, or ops jargon unless the user asks.
- Never give financial advice.

WHEN USER ASKS PRODUCT/TECH:
- Explain clearly with practical steps.
- Only include Sentinel metrics if explicitly requested.

SENTINEL CONTEXT (optional; use only when relevant):
${JSON.stringify(contextPack, null, 2)}`;
}

function buildDiagnosticSystemPrompt(contextPack, language) {
  return `You are Sentinel Diagnostic Assistant.
- Reply in ${language === "en" ? "English" : "Spanish"}.
- Focus on telemetry, score, gates, quality, and concrete diagnosis.
- Be precise and calm (no alarmism).
- Never give financial advice.

SENTINEL CONTEXT:
${JSON.stringify(contextPack, null, 2)}`;
}

function buildOperatorSystemPrompt(contextPack, language) {
  return `You are Sentinel Operator Copilot.
- Reply in ${language === "en" ? "English" : "Spanish"}.
- You can propose implementation and ops actions.
- You DO NOT execute changes directly.
- Always require explicit confirmation from user before action execution.
- Never give financial advice.

SENTINEL CONTEXT:
${JSON.stringify(contextPack, null, 2)}`;
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
async function handleBotMessage(message, language = "es", _sessionId, mode = "chat") {
  const supabase = safeSupabase();
  const hash = hashQuestion(message);
  const resolvedMode = normalizeMode(mode);
  const lang = language === "en" ? "en" : "es";

  if (resolvedMode === "chat" && isGreeting(message)) {
    return {
      answer:
        lang === "en"
          ? "Hey! I'm doing great. How can I help you today?"
          : "¡Hola! Todo bien por aquí. ¿En qué te ayudo hoy?",
      intent: "GREETING",
      source: "chat",
      cached: false,
      confidence_level: "HIGH",
      thumbsId: null
    };
  }

  if (resolvedMode === "operator" && !isOperatorConfirmation(message)) {
    return {
      answer: buildOperatorConfirmationReply(lang),
      intent: "OPERATOR_CONFIRM_REQUIRED",
      source: "operator_guard",
      cached: false,
      confidence_level: "HIGH",
      thumbsId: null
    };
  }

  if (resolvedMode === "chat") {
    const ctx = await buildContextPack();
    if (process.env.OPENAI_API_KEY) {
      const answer = await callOpenAIChatCompletion({
        system: buildChatSystemPrompt(ctx, lang),
        user: String(message),
        maxTokens: 260
      });
      if (typeof answer === "string" && answer.trim()) {
        return {
          answer,
          intent: "CHAT",
          source: "llm_chat",
          cached: false,
          confidence_level: "HIGH",
          thumbsId: null
        };
      }
    }
    return {
      answer:
        lang === "en"
          ? "Got it. I can help with product, UI, deploys, or diagnostics when you ask."
          : "Perfecto. Te puedo ayudar con producto, UI, deploys o diagnóstico cuando tú lo pidas.",
      intent: "CHAT",
      source: "chat_fallback",
      cached: false,
      confidence_level: "MEDIUM",
      thumbsId: null
    };
  }

  if (resolvedMode === "diagnostic" || resolvedMode === "operator") {
    const ctx = await buildContextPack();
    const system =
      resolvedMode === "diagnostic" ? buildDiagnosticSystemPrompt(ctx, lang) : buildOperatorSystemPrompt(ctx, lang);
    if (process.env.OPENAI_API_KEY) {
      const answer = await callOpenAIChatCompletion({
        system,
        user: String(message),
        maxTokens: 320
      });
      if (typeof answer === "string" && answer.trim()) {
        return {
          answer,
          intent: resolvedMode === "diagnostic" ? "DIAGNOSTIC" : "OPERATOR",
          source: resolvedMode === "diagnostic" ? "llm_diag" : "llm_operator",
          cached: false,
          confidence_level: "HIGH",
          thumbsId: null
        };
      }
    }
  }

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

  // ── LOW: OpenAI, then structured fallback ─────────────
  const ctx = await buildContextPack();
  const claudeAnswer = await callClaudeAPI(message, "GENERAL", ctx, language);

  if (claudeAnswer) {
    if (supabase) {
      try {
        await supabase.from("bot_memory").upsert(
          {
            question_hash: hash,
            question_sample: String(message).substring(0, 200),
            intent: "GENERAL",
            answer_type: "llm",
            best_answer: claudeAnswer,
            source: "llm",
            confidence: 0.5,
            language: String(language).slice(0, 5),
            updated_at: new Date().toISOString()
          },
          { onConflict: "question_hash" }
        );
      } catch (_) {}
    }

    return {
      answer: claudeAnswer,
      intent: "GENERAL",
      source: "llm",
      cached: false,
      confidence_level: "LOW",
      thumbsId: null
    };
  }

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
