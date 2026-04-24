/**
 * PRO Telegram (and future Web Push) for tactical / execution regime — **must** use
 * `../lib/tripleRiskRegime.cjs` (same v1 as cockpit UI), never a parallel client-only formula.
 */
"use strict";

const { buildTacticalRegimeForTokenResponse } = require("../lib/tripleRiskRegime.cjs");
const { getMarketData } = require("./marketData");
const { getAnalysis } = require("./riskEngine");
const { getHolderConcentration } = require("./onChainService");
const { pairCreatedRawToUnixMs } = require("../lib/pairTime");
const { tokenPageUrl } = require("./marketingLinks");
const { sendProUserAlert } = require("../bots/telegramBot");
const redis = require("../lib/cache");

const COOLDOWN_SEC = Math.max(60, Math.min(86400, Number(process.env.TACTICAL_REGIME_NOTIFY_COOLDOWN_SEC || 3600)));
const ACTIONS_ALLOW = new Set(
  String(process.env.TACTICAL_REGIME_NOTIFY_ACTIONS || "BUY,SCALP,AVOID")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);

function regimeSignature(r) {
  if (!r) return "";
  return `${r.action}|${r.contextLabelId || ""}|e${r.executionScore}|o${r.overheatScore}`;
}

/**
 * @returns {Promise<null|{ tokenData: object, analysis: object, marketData: object }>}
 */
async function buildTokenDataShape(mint) {
  const marketData = await getMarketData(mint).catch(() => null);
  if (!marketData) return null;
  const [analysis, holdersData] = await Promise.all([
    getAnalysis(mint, marketData).catch(() => null),
    getHolderConcentration(mint).catch(() => ({}))
  ]);
  if (!analysis || analysis.confidence == null) return null;
  return {
    tokenData: {
      market: {
        price: marketData.price,
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        priceChange24h: marketData.priceChange24h,
        symbol: marketData.symbol,
        pairCreatedAt: pairCreatedRawToUnixMs(marketData.pairCreatedAt) ?? null
      },
      holders: { top10Percentage: holdersData?.top10Percentage || 0 }
    },
    analysis,
    marketData
  };
}

function formatTelegramMessage(mint, symbol, regime, pageUrl) {
  return [
    "🎯 Sentinel · Execution regime (advisory)",
    `Token: ${symbol || "?"}`,
    `Mint: ${mint}`,
    `Action: ${regime.action} · SGN ${regime.signalScore ?? "—"} / XEC ${regime.executionScore} / OVH ${regime.overheatScore}`,
    `Context: ${regime.contextLabelId || "—"}`,
    "",
    `Not financial advice. ${pageUrl}`
  ].join("\n");
}

/**
 * Web Push hook — not wired yet; same payload contract as Telegram for a follow-up.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function trySendTacticalRegimeWebPush(_opts) {
  return { ok: false, reason: "web_push_not_implemented" };
}

/**
 * Read-only: regime + message text (for Ops preview, no side effects).
 */
async function previewTacticalRegimeForMint(mint) {
  const built = await buildTokenDataShape(mint);
  if (!built) return { ok: false, reason: "no_data" };
  const regime = buildTacticalRegimeForTokenResponse(built.tokenData, { confidence: built.analysis.confidence });
  if (!regime) return { ok: false, reason: "no_regime" };
  const pageUrl = tokenPageUrl(mint);
  return {
    ok: true,
    data: {
      regime,
      message: formatTelegramMessage(mint, built.marketData?.symbol, regime, pageUrl),
      signature: regimeSignature(regime)
    }
  };
}

/**
 * Send Telegram to a PRO user if regime allowed, signature changed, and cooldown satisfied.
 * @param {{ userId: string, chatId: string, mint: string, force?: boolean }} opts
 */
async function trySendTacticalRegimeTelegram(opts) {
  const { userId, chatId, mint, force = false } = opts;
  if (!userId || !chatId || !mint) return { ok: false, reason: "missing_args" };

  const built = await buildTokenDataShape(mint);
  if (!built) return { ok: false, reason: "no_data" };

  const regime = buildTacticalRegimeForTokenResponse(built.tokenData, { confidence: built.analysis.confidence });
  if (!regime) return { ok: false, reason: "no_regime" };
  if (!ACTIONS_ALLOW.has(String(regime.action).toUpperCase()) && !force) {
    return { ok: false, reason: "action_filtered", regime };
  }

  const sig = regimeSignature(regime);
  const sigKey = `tactical-regime:sig:${userId}:${mint}`;
  const timeKey = `tactical-regime:since:${userId}:${mint}`;

  if (!force) {
    const lastSig = await redis.get(sigKey).catch(() => null);
    if (lastSig === sig) return { ok: false, reason: "unchanged", regime };
    const lastT = await redis.get(timeKey).catch(() => null);
    if (lastT) {
      const ageSec = (Date.now() - Number(lastT)) / 1000;
      if (ageSec < COOLDOWN_SEC) {
        return { ok: false, reason: "cooldown", regime, ageSec, cooldownSec: COOLDOWN_SEC };
      }
    }
  }

  const pageUrl = tokenPageUrl(mint);
  const msg = formatTelegramMessage(mint, built.marketData?.symbol, regime, pageUrl);
  const sent = await sendProUserAlert(String(chatId), msg);
  try {
    await trySendTacticalRegimeWebPush({ userId, chatId, mint, regime, message: msg });
  } catch (_) {}

  if (sent) {
    try {
      await redis.set(sigKey, sig, { ex: 7 * 24 * 60 * 60 });
      await redis.set(timeKey, String(Date.now()), { ex: COOLDOWN_SEC });
    } catch (_) {}
  }
  return { ok: sent, reason: sent ? "sent" : "telegram_failed", regime, message: msg };
}

module.exports = {
  previewTacticalRegimeForMint,
  trySendTacticalRegimeTelegram,
  trySendTacticalRegimeWebPush,
  regimeSignature,
  buildTokenDataShape,
  COOLDOWN_SEC,
  ACTIONS_ALLOW
};
