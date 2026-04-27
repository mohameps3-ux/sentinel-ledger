"use strict";

const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const supportTree = require("../data/support-tree.json");

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_MAX = 300;

// Intent classification (deterministic, no external calls)
function classifyIntent(message) {
  const msg = String(message || "").toLowerCase();
  const analyticsKw = [
    "precio",
    "price",
    "token",
    "score",
    "señal",
    "signal",
    "pump",
    "raydium",
    "dex",
    "chart",
    "liquidez",
    "volumen",
    "blockchain",
    "chain",
    "solana",
    "wallet address",
    "mint"
  ];
  const supportKw = [
    "error",
    "problema",
    "fallo",
    "no funciona",
    "no veo",
    "no hay",
    "pagar",
    "pro",
    "suscripcion",
    "ayuda",
    "help",
    "como",
    "cómo",
    "que es",
    "qué es",
    "activar"
  ];
  const actionKw = ["alertas", "watchlist", "configurar", "activar alerta", "seguir wallet", "añadir"];

  if (actionKw.some((k) => msg.includes(k))) return "ACTION";
  if (analyticsKw.some((k) => msg.includes(k))) return "ANALYTICS";
  if (supportKw.some((k) => msg.includes(k))) return "SUPPORT";
  return "GENERAL";
}

function hashQuestion(question) {
  return crypto
    .createHash("sha256")
    .update(String(question).toLowerCase().trim(), "utf8")
    .digest("hex")
    .substring(0, 16);
}

function checkSupportTree(message) {
  const msg = String(message || "").toLowerCase();
  for (const [key, entry] of Object.entries(supportTree)) {
    if (!entry || !Array.isArray(entry.keywords)) continue;
    if (entry.keywords.some((kw) => msg.includes(String(kw).toLowerCase()))) {
      return { answer: entry.answer, key };
    }
  }
  return null;
}

async function buildContextPack() {
  const supabase = safeSupabase();
  if (!supabase) {
    return { error: "supabase_unconfigured", timestamp: new Date().toISOString() };
  }
  try {
    const { data: signals } = await supabase
      .from("smart_wallet_signals")
      .select("token_address, result_pct, created_at")
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: wallets } = await supabase
      .from("smart_wallets")
      .select("wallet_address, win_rate, smart_score")
      .order("smart_score", { ascending: false })
      .limit(3);

    const { data: ruleRows } = await supabase
      .from("rule_performance")
      .select("rule_id, confidence_score, total_signals, success_count_60m")
      .order("confidence_score", { ascending: false })
      .limit(3);

    const topRules = (ruleRows || []).map((r) => {
      const t = Number(r.total_signals) || 0;
      const w = Number(r.success_count_60m) || 0;
      return {
        rule_id: r.rule_id,
        confidence_score: r.confidence_score,
        win_rate_60m: t > 0 ? Number((w / t).toFixed(4)) : null
      };
    });

    return {
      recentSignals: signals || [],
      topWallets: wallets || [],
      topRules,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return { error: err?.message || "context_unavailable", timestamp: new Date().toISOString() };
  }
}

async function callClaudeAPI(question, _intent, contextPack, language) {
  const key = String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) {
    return "El asistente requiere ANTHROPIC_API_KEY en el servidor. This is not financial advice.";
  }
  const model = String(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const systemPrompt = `You are Sentinel Assistant, the AI support for Sentinel Ledger — a Solana on-chain intelligence terminal.

RULES:
- Answer in ${language === "en" ? "English" : "Spanish"} always
- Be concise and technical — this is a professional trading tool
- Never give financial advice
- Always add disclaimer: "This is not financial advice"
- If asked about prices or signals, use the context data provided
- If you don't know something specific about Sentinel, say so clearly

SENTINEL CONTEXT:
${JSON.stringify(contextPack, null, 2)}

SENTINEL FEATURES:
- Live signal feed with Sentinel Score (0-100)
- Smart Money leaderboard (66+ verified wallets)
- Validation Oracle (validates signals at 5/15/60 min)
- Auto-Discovery (finds new smart wallets automatically)
- Telegram bot: @sentinelledger_intel_bot
- Track Record: /graveyard page`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: HAIKU_MAX,
      system: systemPrompt,
      messages: [{ role: "user", content: String(question).slice(0, 2000) }]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn("[bot] Claude error", res.status, t.slice(0, 200));
    return "No pude procesar tu pregunta ahora. Inténtalo de nuevo. This is not financial advice.";
  }
  const data = await res.json();
  const out = data?.content?.[0]?.text;
  if (!out) return "No pude procesar tu pregunta. Intenta de nuevo.\n\nThis is not financial advice.";
  return `${String(out).trim()}\n\nThis is not financial advice.`;
}

async function handleBotMessage(message, language = "es", _sessionId = null) {
  const supabase = safeSupabase();
  if (!supabase) {
    return {
      answer: "Base de datos no disponible. Configura Supabase en el servidor.",
      intent: "GENERAL",
      source: "error",
      cached: false,
      thumbsId: null
    };
  }
  const hash = hashQuestion(message);
  const intent = classifyIntent(message);

  const { data: cached, error: cacheErr } = await supabase
    .from("bot_memory")
    .select("id, best_answer, times_used, confidence, intent")
    .eq("question_hash", hash)
    .gt("confidence", 0.7)
    .limit(1)
    .maybeSingle();

  if (!cacheErr && cached && intent !== "ANALYTICS") {
    await supabase
      .from("bot_memory")
      .update({
        times_used: Number(cached.times_used || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", cached.id);
    return {
      answer: cached.best_answer,
      intent: cached.intent || intent,
      source: "cache",
      cached: true,
      thumbsId: cached.id
    };
  }

  if (intent === "SUPPORT" || intent === "GENERAL" || intent === "ACTION") {
    const treeMatch = checkSupportTree(message);
    if (treeMatch) {
      const { data: saved, error: upErr } = await supabase
        .from("bot_memory")
        .upsert(
          {
            question_hash: hash,
            question_sample: String(message).substring(0, 200),
            intent,
            answer_type: "manual",
            best_answer: treeMatch.answer,
            source: "docs",
            confidence: 0.9,
            language: String(language).slice(0, 5),
            updated_at: new Date().toISOString()
          },
          { onConflict: "question_hash" }
        )
        .select("id")
        .maybeSingle();
      if (upErr) console.warn("[bot] support tree upsert", upErr.message);
      return {
        answer: treeMatch.answer,
        intent,
        source: "docs",
        cached: false,
        thumbsId: saved?.id || null
      };
    }
  }

  const contextPack = intent === "ANALYTICS" ? await buildContextPack() : {};
  const answer = await callClaudeAPI(message, intent, contextPack, language);

  let thumbsId = null;
  if (intent !== "ANALYTICS") {
    const { data: saved, error: saveErr } = await supabase
      .from("bot_memory")
      .upsert(
        {
          question_hash: hash,
          question_sample: String(message).substring(0, 200),
          intent,
          answer_type: "llm",
          best_answer: answer,
          source: "llm",
          confidence: 0.5,
          language: String(language).slice(0, 5),
          updated_at: new Date().toISOString()
        },
        { onConflict: "question_hash" }
      )
      .select("id")
      .maybeSingle();
    if (saveErr) console.warn("[bot] llm upsert", saveErr.message);
    thumbsId = saved?.id || null;
  }

  return { answer, intent, source: "llm", cached: false, thumbsId };
}

async function handleFeedback(thumbsId, vote) {
  const supabase = safeSupabase();
  if (!supabase) return { ok: false };
  const { data: entry, error } = await supabase.from("bot_memory").select("*").eq("id", thumbsId).maybeSingle();
  if (error || !entry) return { ok: false };

  if (vote === "up") {
    const nextConf = Math.min(Number(entry.confidence || 0.5) + 0.1, 1);
    await supabase
      .from("bot_memory")
      .update({
        thumbs_up: Number(entry.thumbs_up || 0) + 1,
        confidence: nextConf,
        updated_at: new Date().toISOString()
      })
      .eq("id", thumbsId);
  } else {
    const newDown = Number(entry.thumbs_down || 0) + 1;
    const base = Number(entry.confidence || 0.5);
    const nextConf = newDown > 3 ? 0 : Math.max(0, base - 0.1);
    await supabase
      .from("bot_memory")
      .update({
        thumbs_down: newDown,
        confidence: nextConf,
        updated_at: new Date().toISOString()
      })
      .eq("id", thumbsId);
  }
  return { ok: true };
}

module.exports = { handleBotMessage, handleFeedback, classifyIntent };
