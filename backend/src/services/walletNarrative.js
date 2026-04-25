const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");

const CACHE_TTL_SECONDS = 30 * 60;
const SUPPORTED_LANGS = new Set(["es", "en"]);
const INSUFFICIENT = {
  en: "Insufficient history for detailed narrative",
  es: "Historial insuficiente para una narrativa detallada"
};

function normalizeLang(lang) {
  const v = String(lang || "es").toLowerCase();
  return SUPPORTED_LANGS.has(v) ? v : "es";
}

function tokenLabel(tokenAddress) {
  const t = String(tokenAddress || "");
  if (!t) return "token";
  if (t.length <= 10) return t;
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

function daysAgoLabel(isoDate) {
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

function fallbackNarrative(lang, walletAddress, createdAt) {
  const days = createdAt ? daysAgoLabel(createdAt) : null;
  if (lang === "en") {
    return {
      headline: INSUFFICIENT.en,
      sentences: [
        days != null
          ? `Wallet added to radar ${days} days ago; historical sample is still limited.`
          : "Wallet recently added to radar; historical sample is still limited.",
        `Address ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} is being tracked for stronger statistical confidence.`
      ],
      highlight_tags: ["insufficient_history"],
      generated_at: new Date().toISOString()
    };
  }
  return {
    headline: INSUFFICIENT.es,
    sentences: [
      days != null
        ? `Wallet añadida al radar hace ${days} días; el histórico aún es limitado.`
        : "Wallet añadida al radar recientemente; el histórico aún es limitado.",
      `Dirección ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)} en seguimiento para elevar la confianza estadística.`
    ],
    highlight_tags: ["insufficient_history"],
    generated_at: new Date().toISOString()
  };
}

function median(values) {
  const arr = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function holdDurationLabel(hours, lang) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return "—";
  if (h >= 48) return lang === "en" ? `${(h / 24).toFixed(1)}d` : `${(h / 24).toFixed(1)}d`;
  return lang === "en" ? `${h.toFixed(1)}h` : `${h.toFixed(1)}h`;
}

function sentenceFor(metric, lang) {
  if (metric.type === "biggest_win") {
    if (lang === "en") {
      return {
        text: `Best play: bought ${tokenLabel(metric.token)} and resolved at +${metric.pct.toFixed(1)}% (${metric.daysAgo} days ago).`,
        tag: "biggest_win"
      };
    }
    return {
      text: `Su mejor jugada: compró ${tokenLabel(metric.token)} y resolvió en +${metric.pct.toFixed(1)}% (${metric.daysAgo} días atrás).`,
      tag: "biggest_win"
    };
  }
  if (metric.type === "early_buyer") {
    if (lang === "en") {
      return {
        text: `Captured ${metric.count} setups with +20% or more inside the 4h window.`,
        tag: "early_buyer"
      };
    }
    return {
      text: `Capturó ${metric.count} setups con +20% o más dentro de la ventana de 4h.`,
      tag: "early_buyer"
    };
  }
  if (metric.type === "high_winrate") {
    if (lang === "en") {
      return {
        text: `30d win-rate: ${metric.winRate.toFixed(1)}% (${metric.wins}/${metric.total} resolved signals).`,
        tag: "high_winrate"
      };
    }
    return {
      text: `Win-rate últimos 30 días: ${metric.winRate.toFixed(1)}% (${metric.wins}/${metric.total} señales resueltas).`,
      tag: "high_winrate"
    };
  }
  if (metric.type === "activity_spike") {
    if (lang === "en") {
      return {
        text: `Activity is up ${metric.spikePct.toFixed(0)}% this week versus its 30d baseline.`,
        tag: "activity_spike"
      };
    }
    return {
      text: `Actividad +${metric.spikePct.toFixed(0)}% esta semana frente a su baseline de 30 días.`,
      tag: "activity_spike"
    };
  }
  if (metric.type === "median_hold") {
    if (lang === "en") {
      return {
        text: `Median hold footprint: ${holdDurationLabel(metric.hours, lang)} across ${metric.samples} wallet-token entries.`,
        tag: "patient_holder"
      };
    }
    return {
      text: `Huella de hold mediana: ${holdDurationLabel(metric.hours, lang)} en ${metric.samples} entradas wallet-token.`,
      tag: "patient_holder"
    };
  }
  if (metric.type === "rug_avoider") {
    if (lang === "en") {
      return {
        text: `Clean downside profile: ${metric.safeRate.toFixed(1)}% of resolved signals avoided deep drawdowns.`,
        tag: "rug_avoider"
      };
    }
    return {
      text: `Perfil defensivo limpio: ${metric.safeRate.toFixed(1)}% de señales resueltas evitó drawdowns profundos.`,
      tag: "rug_avoider"
    };
  }
  if (metric.type === "diversification") {
    if (lang === "en") {
      return {
        text: `Diversification ratio ${metric.ratio.toFixed(2)} with ${metric.uniqueTokens} unique tokens across ${metric.totalSignals} signals.`,
        tag: "diversified"
      };
    }
    return {
      text: `Ratio de diversificación ${metric.ratio.toFixed(2)} con ${metric.uniqueTokens} tokens únicos en ${metric.totalSignals} señales.`,
      tag: "diversified"
    };
  }
  return null;
}

function headlineFromMetrics(metrics, lang) {
  const byType = new Map(metrics.map((m) => [m.type, m]));
  const early = byType.get("early_buyer");
  const wr = byType.get("high_winrate");
  const rug = byType.get("rug_avoider");
  if (early && early.count >= 3) {
    return lang === "en" ? "Disciplined launch sniper" : "Sniper de lanzamientos con disciplina";
  }
  if (wr && wr.winRate > 75 && wr.total >= 8) {
    return lang === "en" ? "Consistent swing operator" : "Swing trader consistente";
  }
  if (rug && rug.safeRate >= 95) {
    return lang === "en" ? "Selective wallet with downside control" : "Wallet selectiva con control de downside";
  }
  return lang === "en" ? "Verified smart money" : "Smart money verificada";
}

function buildMetrics(signals, walletTokens) {
  const now = Date.now();
  const last30Ms = now - 30 * 24 * 60 * 60 * 1000;
  const last7Ms = now - 7 * 24 * 60 * 60 * 1000;
  const withOutcome = signals
    .filter((s) => s.result_pct != null && Number.isFinite(Number(s.result_pct)))
    .map((s) => ({
      ...s,
      result_pct: Number(s.result_pct),
      createdMs: new Date(s.created_at).getTime()
    }))
    .filter((s) => Number.isFinite(s.createdMs));

  const metrics = [];

  const biggest = withOutcome.reduce(
    (acc, row) => (row.result_pct > acc.result_pct ? row : acc),
    { result_pct: -Infinity }
  );
  if (Number.isFinite(biggest.result_pct) && biggest.result_pct > 20) {
    metrics.push({
      type: "biggest_win",
      pct: biggest.result_pct,
      token: biggest.token_address,
      daysAgo: daysAgoLabel(biggest.created_at),
      impact: Math.min(biggest.result_pct / 100, 5)
    });
  }

  const earlyWins = withOutcome.filter((s) => s.result_pct >= 20);
  if (earlyWins.length > 0) {
    metrics.push({
      type: "early_buyer",
      count: earlyWins.length,
      impact: earlyWins.length >= 3 ? 4 : 2
    });
  }

  const holdAgesHours = (walletTokens || [])
    .map((row) => {
      const boughtAt = new Date(row.bought_at).getTime();
      if (!Number.isFinite(boughtAt)) return null;
      return Math.max(0, (Date.now() - boughtAt) / (60 * 60 * 1000));
    })
    .filter((v) => Number.isFinite(v));
  const medianHoldHours = median(holdAgesHours);
  if (medianHoldHours != null && holdAgesHours.length >= 3) {
    metrics.push({
      type: "median_hold",
      hours: medianHoldHours,
      samples: holdAgesHours.length,
      impact: medianHoldHours >= 24 ? 2.4 : 1.4
    });
  }

  const rows30 = withOutcome.filter((s) => s.createdMs >= last30Ms);
  const wins30 = rows30.filter((s) => s.result_pct > 0).length;
  if (rows30.length >= 5) {
    const winRate = (wins30 / rows30.length) * 100;
    metrics.push({
      type: "high_winrate",
      winRate,
      wins: wins30,
      total: rows30.length,
      impact: winRate > 70 ? 3 : 2
    });
  }

  if (rows30.length >= 6) {
    const weekCount = rows30.filter((s) => s.createdMs >= last7Ms).length;
    const baselineWeek = (rows30.length / 30) * 7;
    if (baselineWeek > 0) {
      const spikePct = ((weekCount - baselineWeek) / baselineWeek) * 100;
      if (spikePct >= 50) {
        metrics.push({
          type: "activity_spike",
          spikePct,
          impact: spikePct > 100 ? 3 : 1
        });
      }
    }
  }

  if (withOutcome.length >= 10) {
    const severeLossCount = withOutcome.filter((s) => s.result_pct <= -70).length;
    const safeRate = ((withOutcome.length - severeLossCount) / withOutcome.length) * 100;
    if (safeRate >= 95) {
      metrics.push({
        type: "rug_avoider",
        safeRate,
        impact: withOutcome.length > 20 ? 3 : 1.5
      });
    }
  }

  const uniqueTokens = new Set(signals.map((s) => s.token_address).filter(Boolean)).size;
  if (signals.length >= 8) {
    const ratio = uniqueTokens / Math.max(1, signals.length);
    if (ratio >= 0.55) {
      metrics.push({
        type: "diversification",
        ratio,
        uniqueTokens,
        totalSignals: signals.length,
        impact: ratio > 0.8 ? 2.6 : 1.8
      });
    }
  }

  return metrics;
}

function responseFromNarrative(address, narrative, cached) {
  return {
    headline: narrative.headline,
    sentences: narrative.sentences,
    highlight_tags: narrative.highlight_tags,
    cached,
    address,
    generated_at: narrative.generated_at,
    narrative
  };
}

async function getWalletNarrative(walletAddress, options = {}) {
  const lang = normalizeLang(options.lang);
  const cacheKey = `narrative:v1:${walletAddress}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached && typeof cached === "object" && cached?.narratives?.[lang]) {
      return responseFromNarrative(walletAddress, cached.narratives[lang], true);
    }
  } catch (error) {
    console.warn("wallet narrative cache read:", error.message);
  }

  const supabase = getSupabase();
  const { data: walletRow, error: walletError } = await supabase
    .from("smart_wallets")
    .select("wallet_address, last_seen, updated_at")
    .eq("wallet_address", walletAddress)
    .maybeSingle();
  if (walletError) throw walletError;
  if (!walletRow) return null;

  const { data: signalRows, error: signalError } = await supabase
    .from("smart_wallet_signals")
    .select("token_address, result_pct, entry_price_usd, price_1h_usd, price_4h_usd, created_at, confidence")
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: false })
    .limit(800);
  if (signalError) throw signalError;
  const signals = Array.isArray(signalRows) ? signalRows : [];

  const { data: tokenRows, error: tokenError } = await supabase
    .from("wallet_tokens")
    .select("token_address, bought_at, amount_usd")
    .eq("wallet_address", walletAddress)
    .order("bought_at", { ascending: false })
    .limit(800);
  if (tokenError) {
    console.warn("wallet narrative wallet_tokens:", tokenError.message);
  }
  const walletTokens = Array.isArray(tokenRows) ? tokenRows : [];

  function buildNarrative(langCode) {
    if (signals.length < 3) {
      return fallbackNarrative(langCode, walletAddress, walletRow.last_seen || walletRow.updated_at);
    }
    const metrics = buildMetrics(signals, walletTokens);
    const topMetrics = [...metrics].sort((a, b) => b.impact - a.impact).slice(0, 3);
    const sentenceRows = topMetrics.map((m) => sentenceFor(m, langCode)).filter(Boolean);
    if (sentenceRows.length < 2) {
      return fallbackNarrative(langCode, walletAddress, walletRow.last_seen || walletRow.updated_at);
    }
    return {
      headline: headlineFromMetrics(topMetrics, langCode),
      sentences: sentenceRows.map((s) => s.text).slice(0, 3),
      highlight_tags: sentenceRows.map((s) => s.tag).slice(0, 3),
      generated_at: new Date().toISOString()
    };
  }

  const narratives = {
    es: buildNarrative("es"),
    en: buildNarrative("en")
  };
  try {
    await redis.set(cacheKey, { address: walletAddress, narratives }, { ex: CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn("wallet narrative cache write:", error.message);
  }
  return responseFromNarrative(walletAddress, narratives[lang], false);
}

module.exports = { getWalletNarrative };

